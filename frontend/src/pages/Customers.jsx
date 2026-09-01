import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import api from "../services/api.js";
import "./Customers.css";

function Customers() {
  const { user } = useAuth();
  // useLocalStorageState so visiting this page populates ksc_customers
  // for other pages (JobCards, Vehicles, JobCardNew) that look up customer names.
  const [customers, setCustomers] = useLocalStorageState("ksc_customers", []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const isRootAdmin = user?.role === "OWNER";

  const loadCustomers = async () => {
    try {
      const { data } = await api.get("/customers");
      // Map to a shape compatible with other pages that look up by id/mongoId,
      // while keeping _id so this page's edit/delete still works.
      const mapped = (Array.isArray(data) ? data : []).map((c) => ({
        _id: c._id,
        id: String(c._id),
        mongoId: String(c._id),
        name: c.name || "",
        phone: c.phone || "",
        email: c.email || "",
        notes: c.notes || "",
        createdAt: c.createdAt,
      }));
      setCustomers(mapped);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load customers.");
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const formatCurrency = (value) => {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const nameMatch = customer.name?.toLowerCase().includes(query);
      const phoneMatch = customer.phone?.toLowerCase().includes(query);
      return nameMatch || phoneMatch;
    });
  }, [customers, searchQuery]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isRootAdmin) return;
    setError("");
    try {
      if (editingId) {
        await api.patch(`/customers/${editingId}`, {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
        });
        setEditingId("");
      } else {
        await api.post("/customers", {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
        });
      }
      setName("");
      setPhone("");
      setEmail("");
      setNotes("");
      await loadCustomers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save customer.");
    }
  };

  const handleEdit = (customer) => {
    if (!isRootAdmin) return;
    setEditingId(customer._id);
    setName(customer.name || "");
    setPhone(customer.phone || "");
    setEmail(customer.email || "");
    setNotes(customer.notes || "");
  };

  const handleDelete = async (customerId) => {
    if (!isRootAdmin) return;
    if (!window.confirm("Delete this customer?")) return;
    setError("");
    try {
      await api.delete(`/customers/${customerId}`);
      if (editingId === customerId) {
        setEditingId("");
        setName("");
        setPhone("");
        setEmail("");
        setNotes("");
      }
      await loadCustomers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete customer.");
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
          {error ? <p className="empty-state" style={{ color: "#dc2626" }}>{error}</p> : null}
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
                    <th>Loyalty Rewards</th>
                    <th>Additional Info</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => {
                    const joinDate = customer.createdAt
                      ? new Date(customer.createdAt).toLocaleDateString()
                      : "-";
                    return (
                      <tr key={customer._id}>
                        <td>{joinDate}</td>
                        <td>
                          <div className="customer-name">
                            {customer.name}
                          </div>
                          <div className="customer-meta">{customer.email}</div>
                        </td>
                        <td className="customer-phone">{customer.phone}</td>
                        <td>{formatCurrency(customer.lifetimeValue || 0)}</td>
                        <td>{customer.completedVisits || 0}</td>
                        <td>
                          {customer.availableRewardsCount > 0
                            ? `${customer.availableRewardsCount} available`
                            : "-"}
                        </td>
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
                            onClick={() => handleDelete(customer._id)}
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
