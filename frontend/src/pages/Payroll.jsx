import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Payroll.css";

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

function Payroll() {
  const [month, setMonth] = useState(toMonthValue(new Date()));
  const [records, setRecords] = useState([]);
  const [runs, setRuns] = useState([]);
  const [expandedId, setExpandedId] = useState("");
  const [adjustments, setAdjustments] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await api.get("/payroll", { params: { month } });
    setRecords(Array.isArray(data?.records) ? data.records : []);
    setRuns(Array.isArray(data?.runs) ? data.runs : []);
  };

  useEffect(() => {
    load().catch((err) =>
      setError(err.response?.data?.message || "Unable to load payroll.")
    );
  }, [month]);

  const monthSummary = useMemo(() => {
    const run = runs.find((entry) => entry.month === month);
    return (
      run || {
        totalEmployees: 0,
        totalNetSalary: 0,
        totalPaid: 0,
      }
    );
  }, [runs, month]);

  const generate = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.post("/payroll/generate", { month });
      await load();
      setMessage("Draft payroll generated.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to generate payroll.");
    } finally {
      setLoading(false);
    }
  };

  const saveAdjustments = async (record) => {
    const input = adjustments[record._id] || { allowance: "", deduction: "", reason: "" };
    const oneTimeAllowances = input.allowance
      ? [{ name: "One-Time Allowance", amount: Number(input.allowance), reason: input.reason }]
      : [];
    const oneTimeDeductions = input.deduction
      ? [{ name: "One-Time Deduction", amount: Number(input.deduction), reason: input.reason }]
      : [];
    try {
      await api.put(`/payroll/${record._id}/line-items`, {
        oneTimeAllowances,
        oneTimeDeductions,
      });
      await load();
      setMessage("Adjustments saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save adjustments.");
    }
  };

  const approve = async (id) => {
    try {
      await api.put(`/payroll/${id}/approve`, {});
      await load();
      setMessage("Payroll approved and attendance locked.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to approve payroll.");
    }
  };

  const markPaid = async (id) => {
    try {
      await api.put(`/payroll/${id}/mark-paid`, {
        paymentDate: new Date().toISOString(),
        paymentMethod: "cash",
      });
      await load();
      setMessage("Payroll marked as paid.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to mark paid.");
    }
  };

  return (
    <div className="payroll-page">
      <div className="payroll-header">
        <div>
          <PageHeader title="Payroll" />
          <p className="payroll-subtitle">Generate, review, approve, and pay monthly payroll runs.</p>
        </div>
      </div>
      {error ? <p className="payroll-error">{error}</p> : null}
      {message ? <p className="payroll-success">{message}</p> : null}

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Payroll List</h2>
          <p>Run payroll for all active employees by month.</p>
        </div>
        <div className="payroll-filters">
          <div className="payroll-field">
            <label>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Total Employees</span>
            <strong>{monthSummary.totalEmployees || 0}</strong>
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Total Net Salary</span>
            <strong>{Number(monthSummary.totalNetSalary || 0).toFixed(2)}</strong>
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Total Paid</span>
            <strong>{Number(monthSummary.totalPaid || 0).toFixed(2)}</strong>
          </div>
        </div>
        <div className="payroll-actions">
          <button type="button" onClick={generate} disabled={loading}>
            Generate Payroll
          </button>
        </div>
      </section>

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Generated Employees</h2>
          <p>Review and adjust before approval.</p>
        </div>
        {records.length === 0 ? (
          <p className="payroll-muted">No payroll records for this month.</p>
        ) : (
          <div className="payroll-summary">
            {records.map((record) => (
              <div className="payroll-summary__card" key={record._id}>
                <span>{record.employeeName}</span>
                <strong>{Number(record.netSalary || 0).toFixed(2)}</strong>
                <p style={{ margin: 0, color: "#64748b" }}>
                  Days: {record.attendanceSummary?.workingDays || 0} | LOP: {record.attendanceSummary?.lopDays || 0}
                </p>
                <p style={{ margin: 0, color: "#64748b" }}>Status: {record.status}</p>
                <div className="payroll-actions__buttons">
                  <button
                    type="button"
                    className="payroll-actions__secondary"
                    onClick={() =>
                      setExpandedId((prev) => (prev === record._id ? "" : record._id))
                    }
                  >
                    {expandedId === record._id ? "Hide" : "Review & Adjust"}
                  </button>
                  <button
                    type="button"
                    onClick={() => approve(record._id)}
                    disabled={record.status !== "draft"}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => markPaid(record._id)}
                    disabled={record.status === "draft"}
                  >
                    Mark Paid
                  </button>
                </div>
                {expandedId === record._id ? (
                  <div style={{ marginTop: "12px" }}>
                    <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Breakdown</p>
                    <p style={{ margin: "0 0 6px" }}>
                      Basic: {Number(record.earnings?.basicSalary || 0).toFixed(2)}
                    </p>
                    <p style={{ margin: "0 0 6px" }}>
                      Allowances:{" "}
                      {Number(
                        (record.earnings?.allowances || []).reduce(
                          (sum, item) => sum + Number(item.amount || 0),
                          0
                        )
                      ).toFixed(2)}
                    </p>
                    <p style={{ margin: "0 0 6px" }}>
                      Deductions: {Number(record.deductions?.totalDeductions || 0).toFixed(2)}
                    </p>
                    <div className="payroll-adjustments">
                      <div className="payroll-field">
                        <label>One-Time Allowance</label>
                        <input
                          type="number"
                          min="0"
                          value={adjustments[record._id]?.allowance || ""}
                          onChange={(e) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [record._id]: {
                                ...(prev[record._id] || {}),
                                allowance: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="payroll-field">
                        <label>One-Time Deduction</label>
                        <input
                          type="number"
                          min="0"
                          value={adjustments[record._id]?.deduction || ""}
                          onChange={(e) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [record._id]: {
                                ...(prev[record._id] || {}),
                                deduction: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="payroll-field">
                        <label>Reason</label>
                        <input
                          value={adjustments[record._id]?.reason || ""}
                          onChange={(e) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [record._id]: {
                                ...(prev[record._id] || {}),
                                reason: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="payroll-field">
                        <button type="button" onClick={() => saveAdjustments(record)}>
                          Save Adjustment
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Payroll;
