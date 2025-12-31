import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import { createId } from "../utils/id.js";
import "./Customers.css";

function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useLocalStorageState("ksc_customers", []);
  const [jobCards] = useLocalStorageState("ksc_job_cards", []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const isRootAdmin = user?.role === "OWNER";

  const formatCurrency = (value) => {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const customerMetrics = useMemo(() => {
    const metrics = new Map();
    jobCards.forEach((job) => {
      if (!job) return;
      const ownerId = job.ownerId || job.customerId;
      if (!ownerId) return;
      const status = job.status || "OPEN";
      if (!["COMPLETED", "CLOSED"].includes(status)) return;
      const partsTotal = (job.partsUsed || []).reduce((sum, part) => {
        const qty = Number(part.quantity) || 0;
        const unit = Number(part.unitPrice) || 0;
        return sum + qty * unit;
      }, 0);
      const labor = Number(job.laborCharges) || 0;
      const total = partsTotal + labor;
      const current = metrics.get(ownerId) || {
        completedVisits: 0,
        lifetimeValue: 0,
      };
      metrics.set(ownerId, {
        completedVisits: current.completedVisits + 1,
        lifetimeValue: current.lifetimeValue + total,
      });
    });
    return metrics;
  }, [jobCards]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const nameMatch = customer.name?.toLowerCase().includes(query);
      const phoneMatch = customer.phone?.toLowerCase().includes(query);
      return nameMatch || phoneMatch;
    });
  }, [customers, searchQuery]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isRootAdmin) return;
    if (editingId) {
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === editingId
            ? {
                ...customer,
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                notes: notes.trim(),
              }
            : customer
        )
      );
      setEditingId("");
    } else {
      const newCustomer = {
        id: createId("cust"),
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim(),
        createdAt: new Date().toISOString(),
      };
      setCustomers((prev) => [newCustomer, ...prev]);
    }
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
  };

  const handleEdit = (customer) => {
    if (!isRootAdmin) return;
    setEditingId(customer.id);
    setName(customer.name || "");
    setPhone(customer.phone || "");
    setEmail(customer.email || "");
    setNotes(customer.notes || "");
  };

  const handleDelete = (customerId) => {
    if (!isRootAdmin) return;
    if (!window.confirm("Delete this customer?")) return;
    setCustomers((prev) => prev.filter((customer) => customer.id !== customerId));
    if (editingId === customerId) {
      setEditingId("");
      setName("");
      setPhone("");
      setEmail("");
      setNotes("");
    }
  };

  return (
    <div className="customers-page">
      <PageHeader title="Customers" />
      <div className="customers-grid">
        <form
          className="customers-card customers-card--form"
          onSubmit={handleSubmit}
        >
          <div className="card-head">
            <h2>{editingId ? "Edit Customer" : "Add Customer"}</h2>
            <p>Create a new customer profile.</p>
          </div>
          <div className="form-grid form-grid--wide">
            <div className="field">
              <label htmlFor="customer-name">Name</label>
              <input
                id="customer-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="customer-phone">Phone</label>
              <input
                id="customer-phone"
                name="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="customer-email">Email</label>
              <input
                id="customer-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="customer-notes">Additional Info (Comment)</label>
              <textarea
                id="customer-notes"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows="3"
                placeholder="Optional notes about this customer."
              />
            </div>
          </div>
          <div className="customer-form-actions">
            {editingId ? (
              <button
                className="secondary-button"
                type="button"
                disabled={!isRootAdmin}
                onClick={() => {
                  setEditingId("");
                  setName("");
                  setPhone("");
                  setEmail("");
                  setNotes("");
                }}
              >
                Cancel
              </button>
            ) : null}
            <button
              className="primary-button"
              type="submit"
              disabled={!isRootAdmin}
              title={
                isRootAdmin ? "" : "Only root-admin can edit customer records."
              }
            >
              {editingId ? "Save Changes" : "Add Customer"}
            </button>
          </div>
        </form>

        <section className="customers-card">
          <div className="card-head">
            <h2>Customer List</h2>
            <p>Recent customers and contact details.</p>
          </div>
          <div className="customers-search">
            <label htmlFor="customer-search">Search</label>
            <input
              id="customer-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name or mobile number"
            />
          </div>
          {customers.length === 0 ? (
            <p className="empty-state">No customers yet.</p>
          ) : (
            <div className="customers-table">
              <table>
                <thead>
                  <tr>
                    <th>Join Date</th>
                    <th>Customer Name</th>
                    <th>Mobile Number</th>
                    <th>Lifetime Value</th>
                    <th>Completed Visits</th>
                    <th>Additional Info</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => {
                    const metrics =
                      customerMetrics.get(customer.id) || {};
                    const joinDate = customer.createdAt
                      ? new Date(customer.createdAt).toLocaleDateString()
                      : "-";
                    return (
                      <tr key={customer.id}>
                        <td>{joinDate}</td>
                        <td>
                          <div className="customer-name">
                            {customer.name}
                          </div>
                          <div className="customer-meta">{customer.email}</div>
                        </td>
                        <td className="customer-phone">{customer.phone}</td>
                        <td>{formatCurrency(metrics.lifetimeValue || 0)}</td>
                        <td>{metrics.completedVisits || 0}</td>
                        <td>{customer.notes || "-"}</td>
                        <td className="customers-actions">
                          <button
                            type="button"
                            className="customers-action"
                            onClick={() => handleEdit(customer)}
                            disabled={!isRootAdmin}
                            title={
                              isRootAdmin
                                ? ""
                                : "Only root-admin can edit customer records."
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="customers-action customers-action--danger"
                            onClick={() => handleDelete(customer.id)}
                            disabled={!isRootAdmin}
                            title={
                              isRootAdmin
                                ? ""
                                : "Only root-admin can delete customer records."
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default Customers;
