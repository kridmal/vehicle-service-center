import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./Purchases.css";

const STATUS_LABELS = { DRAFT: "Draft", SENT: "Sent", CONVERTED: "Converted" };

function PurchaseRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/purchase-requests");
        setRequests(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err.response?.data?.message || "Unable to load purchase requests.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [navigate]);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  return (
    <div className="purchases-page">
      <PageHeader title="Purchase Requests" />

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>Purchase Requests</h2>
            <p>Draft orders sent to dealers before creating a credit invoice.</p>
          </div>
          <Link className="purchases-button" to="/purchase-requests/new">
            + New Request
          </Link>
        </div>

        <div className="purchases-grid">
          <div className="purchases-field">
            <label htmlFor="pr-status-filter">Status</label>
            <select
              id="pr-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="CONVERTED">Converted</option>
            </select>
          </div>
        </div>

        {error ? <p className="purchases-alert purchases-alert--error">{error}</p> : null}

        {isLoading ? (
          <p className="purchases-empty">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="purchases-empty">No purchase requests found.</p>
        ) : (
          <div className="purchases-table">
            <table>
              <thead>
                <tr>
                  <th>Request No</th>
                  <th>Date</th>
                  <th>Dealer</th>
                  <th className="purchases-right">Items</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => {
                  const id = req._id;
                  const status = req.status || "DRAFT";
                  return (
                    <tr key={id}>
                      <td>{req.requestNumber || "—"}</td>
                      <td>
                        {req.requestDate
                          ? new Date(req.requestDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        {req.dealerSnapshot?.dealerCode || req.dealer?.dealerCode || "—"} —{" "}
                        {req.dealerSnapshot?.name || req.dealer?.name || "—"}
                      </td>
                      <td className="purchases-right">{(req.items || []).length}</td>
                      <td>
                        <span className={`purchase-status purchase-status--pr-${status.toLowerCase()}`}>
                          {STATUS_LABELS[status] || status}
                        </span>
                      </td>
                      <td>
                        <div className="purchases-actions">
                          <Link className="purchases-button-ghost" to={`/purchase-requests/${id}`}>
                            View
                          </Link>
                        </div>
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
  );
}

export default PurchaseRequests;
