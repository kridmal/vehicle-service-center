import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Payslips.css";

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const buildPayslipHtml = (record, employee) => {
  const monthLabel = formatMonthLabel(record.month);
  const allowances = record.earnings?.allowances || [];
  const deductions = record.deductions?.otherDeductions || [];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip - ${record.employeeName}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 20px; color: #111827; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 26px; font-weight: 700; }
    .sub { color: #6b7280; font-size: 12px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; margin-top: 14px; padding: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
    .net { margin-top: 10px; font-size: 20px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">PAYSLIP</div>
      <div class="sub">Vehicle Service Center - ${monthLabel}</div>
    </div>
    <div class="sub">Generated: ${new Date(record.generatedAt || Date.now()).toLocaleString()}</div>
  </div>
  <div class="card">
    <div class="grid">
      <div><strong>Name:</strong> ${record.employeeName || "-"}</div>
      <div><strong>NIC:</strong> ${employee?.NIC || employee?.idNumber || "-"}</div>
      <div><strong>Role:</strong> ${employee?.roleName || "-"}</div>
      <div><strong>Department:</strong> ${employee?.departmentName || "-"}</div>
      <div><strong>Join Date:</strong> ${employee?.joinDate ? new Date(employee.joinDate).toLocaleDateString() : "-"}</div>
      <div><strong>Status:</strong> ${record.status || "-"}</div>
    </div>
  </div>
  <div class="card">
    <h4>Attendance</h4>
    <div class="grid">
      <div>Working Days: ${record.attendanceSummary?.workingDays || 0}</div>
      <div>Present: ${record.attendanceSummary?.presentDays || 0}</div>
      <div>Absent: ${record.attendanceSummary?.absentDays || 0}</div>
      <div>Leave: ${record.attendanceSummary?.leaveDays || 0}</div>
      <div>LOP: ${record.attendanceSummary?.lopDays || 0}</div>
    </div>
  </div>
  <div class="card">
    <h4>Earnings</h4>
    <table>
      <tr><td>Basic Salary</td><td>${formatMoney(record.earnings?.basicSalary)}</td></tr>
      ${allowances.map((row) => `<tr><td>${row.name}</td><td>${formatMoney(row.amount)}</td></tr>`).join("")}
      <tr><td><strong>Gross</strong></td><td><strong>${formatMoney(record.earnings?.grossEarnings)}</strong></td></tr>
    </table>
    <h4>Deductions</h4>
    <table>
      <tr><td>LOP Deduction</td><td>${formatMoney(record.deductions?.lopDeduction)}</td></tr>
      <tr><td>Half Day Deduction</td><td>${formatMoney(record.deductions?.halfDayDeduction)}</td></tr>
      ${deductions.map((row) => `<tr><td>${row.name}</td><td>${formatMoney(row.amount)}</td></tr>`).join("")}
      <tr><td><strong>Total Deductions</strong></td><td><strong>${formatMoney(record.deductions?.totalDeductions)}</strong></td></tr>
    </table>
    <div class="net">Net Salary: ${formatMoney(record.netSalary)}</div>
  </div>
  <div class="sub" style="margin-top:18px">Authorized Signature: ____________________</div>
</body>
</html>`;
};

function Payslips() {
  const [staff, setStaff] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthValue(new Date()));
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const detailsRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const [staffRes, payrollRes] = await Promise.all([
      api.get("/staff"),
      api.get("/payroll", { params: { month: selectedMonth, employeeId: selectedStaffId || undefined } }),
    ]);
    setStaff(Array.isArray(staffRes.data) ? staffRes.data : []);
    setRecords(Array.isArray(payrollRes.data?.records) ? payrollRes.data.records : []);
    setLoading(false);
  };

  useEffect(() => {
    load().catch((err) => {
      setLoading(false);
      setError(err.response?.data?.message || "Unable to load payslips.");
    });
  }, [selectedMonth, selectedStaffId]);

  useEffect(() => {
    if (!selectedRecord || !detailsRef.current) return;
    detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedRecord]);

  const summaryTotals = useMemo(
    () =>
      records.reduce(
        (acc, item) => {
          acc.totalNet += Number(item.netSalary || 0);
          acc.totalGross += Number(item.earnings?.grossEarnings || 0);
          return acc;
        },
        { totalNet: 0, totalGross: 0 }
      ),
    [records]
  );

  const getEmployee = (employeeId) =>
    staff.find((entry) => String(entry._id || entry.id) === String(employeeId));

  const printRecord = (record) => {
    const employee = getEmployee(record.employeeId);
    const html = buildPayslipHtml(record, employee);
    const printWindow = window.open("", "_blank", "width=900,height=720");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const markPaid = async (id) => {
    setActionLoadingId(id);
    try {
      await api.put(`/payroll/${id}/mark-paid`, {
        paymentDate: new Date().toISOString(),
        paymentMethod: "cash",
      });
      await load();
      if (selectedRecord?._id === id) {
        const fresh = records.find((row) => row._id === id);
        setSelectedRecord(fresh || null);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to mark paid.");
    } finally {
      setActionLoadingId("");
    }
  };

  return (
    <div className="payslips-page">
      <div className="payslips-header">
        <div>
          <PageHeader title="Payslips" />
          <p className="payslips-subtitle">Payroll-backed payslip register.</p>
        </div>
      </div>
      {error ? <p className="payslips-error">{error}</p> : null}

      <section className="payslips-card">
        <div className="payslips-card__head">
          <h2>Filters</h2>
        </div>
        <div className="payslips-filters">
          <div className="payslips-filters__fields">
            <div className="payslips-field">
              <label>Month</label>
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>
            <div className="payslips-field">
              <label>Employee</label>
              <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
                <option value="">All</option>
                {staff.map((entry) => (
                  <option key={entry._id || entry.id} value={entry._id || entry.id}>
                    {entry.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="payslips-summary">
            <h3>Summary</h3>
            <div className="payslips-summary__row">
              <span>Total Gross</span>
              <strong>{formatMoney(summaryTotals.totalGross)}</strong>
            </div>
            <div className="payslips-summary__row">
              <span>Total Net</span>
              <strong>{formatMoney(summaryTotals.totalNet)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="payslips-card">
        <div className="payslips-card__head">
          <h2>Payslip Register</h2>
          <p>{loading ? "Loading..." : `${records.length} records`}</p>
        </div>
        {loading ? (
          <p className="payslips-muted">Loading...</p>
        ) : records.length === 0 ? (
          <p className="payslips-muted">No payroll records.</p>
        ) : (
          <div className="payslips-table-wrapper">
            <table className="payslips-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Net</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record._id}
                    className={selectedRecord?._id === record._id ? "payslip-row--active" : ""}
                  >
                    <td>{record.employeeName}</td>
                    <td>{formatMonthLabel(record.month)}</td>
                    <td>{formatMoney(record.netSalary)}</td>
                    <td>
                      <span
                        className={
                          record.status === "paid"
                            ? "status-badge status-badge--paid"
                            : "status-badge status-badge--unpaid"
                        }
                      >
                        {String(record.status || "draft").toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="payslip-actions">
                        <button type="button" onClick={() => setSelectedRecord((prev) => (prev?._id === record._id ? null : record))}>
                          View
                        </button>
                        <button type="button" onClick={() => printRecord(record)}>
                          Print
                        </button>
                        <button type="button" onClick={() => printRecord(record)}>
                          Download PDF
                        </button>
                        {record.status !== "paid" ? (
                          <button
                            type="button"
                            className="payslip-action-paid"
                            disabled={actionLoadingId === record._id}
                            onClick={() => markPaid(record._id)}
                          >
                            Mark Paid
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRecord ? (
        <section className="payslips-card" ref={detailsRef}>
          <div className="payslips-card__head">
            <h2>Payslip Details</h2>
          </div>
          <div className="payslip-detail">
            <div>
              <p className="payslip-label">Employee</p>
              <h3>{selectedRecord.employeeName}</h3>
              <p className="payslip-subtext">{formatMonthLabel(selectedRecord.month)}</p>
            </div>
            <div className="payslip-meta">
              <div>
                <span>Gross</span>
                <strong>{formatMoney(selectedRecord.earnings?.grossEarnings)}</strong>
              </div>
              <div>
                <span>Net</span>
                <strong className="payslip-net">{formatMoney(selectedRecord.netSalary)}</strong>
              </div>
            </div>
          </div>
          <div className="payslip-meta payslip-meta--details">
            <div><span>Working Days</span><strong>{selectedRecord.attendanceSummary?.workingDays || 0}</strong></div>
            <div><span>Present</span><strong>{selectedRecord.attendanceSummary?.presentDays || 0}</strong></div>
            <div><span>Absent</span><strong>{selectedRecord.attendanceSummary?.absentDays || 0}</strong></div>
            <div><span>Leave</span><strong>{selectedRecord.attendanceSummary?.leaveDays || 0}</strong></div>
            <div><span>LOP</span><strong>{selectedRecord.attendanceSummary?.lopDays || 0}</strong></div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default Payslips;
