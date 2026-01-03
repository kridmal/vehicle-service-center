import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Payslips.css";

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const parseMonthValue = (value) => {
  if (!value) return null;
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!year || !month) return null;
  return { year, month };
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatMonthLabel = (month, year) => {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const buildPayslipHtml = (payslip) => {
  const name = payslip.staffSnapshot?.name || "Staff";
  const role = payslip.staffSnapshot?.roleName || "Role";
  const salaryType = payslip.staffSnapshot?.salaryType || "FIXED";
  const monthLabel = formatMonthLabel(payslip.month, payslip.year);
  const adjustments = payslip.adjustments || {};
  const deductions = payslip.deductions || {};
  const laborSummary = payslip.laborSummary || {};
  const overtimeSummary = payslip.overtimeSummary || {};
  const allowances = payslip.allowances || {};
  const workingDays = Number(payslip.workingDays) || 0;
  const perDayRate = Number(payslip.perDayRate) || 0;
  const completedJobs = Number(payslip.completedJobs) || 0;
  const presentDays = Number(payslip.presentDays) || 0;
  const halfDays = Number(payslip.halfDays) || 0;
  const approvedLeaveDays = Number(payslip.approvedLeaveDays) || 0;
  const lopDays = Number(payslip.lopDays) || 0;
  const lopAmount = Number(payslip.lopAmount) || 0;
  const totalLaborHours = Number(laborSummary.totalLaborHours) || 0;
  const incentiveAmount = Number(laborSummary.incentiveAmount) || 0;
  const otHours = Number(overtimeSummary.approvedOtHours) || 0;
  const otRate = Number(overtimeSummary.otRate) || 0;
  const otAmount = Number(overtimeSummary.otAmount) || 0;
  const allowanceTotal =
    Number(allowances.recurringTotal) + Number(allowances.oneOffTotal || 0);
  const grossSalary = Number(payslip.grossSalary) || 0;
  const netSalary = Number(payslip.netSalary) || 0;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip - ${name}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #0f172a; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; }
    .brand h1 { margin: 0; font-size: 22px; }
    .brand p { margin: 4px 0 0; color: #475569; font-size: 12px; }
    .meta { text-align: right; font-size: 12px; color: #475569; }
    .meta strong { display: block; color: #0f172a; font-size: 14px; }
    .card { margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
    .value { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .net { margin-top: 16px; padding: 12px; background: #0f172a; color: #fff; border-radius: 10px; font-size: 16px; font-weight: 600; }
    .signatures { margin-top: 32px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; font-size: 12px; color: #475569; }
    .signatures span { display: block; margin-top: 36px; border-top: 1px solid #cbd5e1; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1>Vehicle Service Center</h1>
      <p>Official Payslip Statement</p>
    </div>
    <div class="meta">
      <strong>${monthLabel}</strong>
      Status: ${payslip.status || "UNPAID"}
    </div>
  </div>

  <div class="card">
    <div class="grid">
      <div>
        <div class="label">Staff Name</div>
        <div class="value">${name}</div>
      </div>
      <div>
        <div class="label">Role</div>
        <div class="value">${role}</div>
      </div>
      <div>
        <div class="label">Salary Type</div>
        <div class="value">${salaryType}</div>
      </div>
      <div>
        <div class="label">Period</div>
        <div class="value">${monthLabel}</div>
      </div>
      <div>
        <div class="label">Working Days</div>
        <div class="value">${workingDays}</div>
      </div>
      <div>
        <div class="label">Present Days</div>
        <div class="value">${presentDays}</div>
      </div>
      <div>
        <div class="label">Half Days</div>
        <div class="value">${halfDays}</div>
      </div>
      <div>
        <div class="label">Leave Days</div>
        <div class="value">${approvedLeaveDays}</div>
      </div>
      <div>
        <div class="label">Per Day Rate</div>
        <div class="value">${formatMoney(perDayRate)}</div>
      </div>
      <div>
        <div class="label">LOP Days</div>
        <div class="value">${lopDays}</div>
      </div>
      <div>
        <div class="label">LOP Amount</div>
        <div class="value">${formatMoney(lopAmount)}</div>
      </div>
      <div>
        <div class="label">Completed Jobs</div>
        <div class="value">${completedJobs}</div>
      </div>
      <div>
        <div class="label">Total Labor Hours</div>
        <div class="value">${totalLaborHours.toFixed(2)}</div>
      </div>
      <div>
        <div class="label">Incentive Amount</div>
        <div class="value">${formatMoney(incentiveAmount)}</div>
      </div>
      <div>
        <div class="label">OT Hours</div>
        <div class="value">${otHours.toFixed(2)}</div>
      </div>
      <div>
        <div class="label">OT Amount</div>
        <div class="value">${formatMoney(otAmount)}</div>
      </div>
      <div>
        <div class="label">Allowances</div>
        <div class="value">${formatMoney(allowanceTotal)}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>Earnings</h3>
    <table>
      <tr><td>Gross Earnings</td><td>${formatMoney(grossSalary)}</td></tr>
      <tr><td>Allowances</td><td>${formatMoney(allowanceTotal)}</td></tr>
      <tr><td>Incentive</td><td>${formatMoney(incentiveAmount)}</td></tr>
      <tr><td>Overtime (${otHours.toFixed(2)}h @ ${formatMoney(otRate)})</td><td>${formatMoney(otAmount)}</td></tr>
      <tr><td>Bonus</td><td>${formatMoney(adjustments.bonus)}</td></tr>
    </table>

    <h3>Deductions</h3>
    <table>
      <tr><td>LOP Amount</td><td>${formatMoney(lopAmount)}</td></tr>
      <tr><td>Advance</td><td>${formatMoney(adjustments.advance ?? deductions.advance)}</td></tr>
      <tr><td>Penalties</td><td>${formatMoney(adjustments.penalties ?? deductions.penalties)}</td></tr>
      <tr><td>Other</td><td>${formatMoney(adjustments.other ?? deductions.other)}</td></tr>
    </table>

    <div class="net">Net Salary: ${formatMoney(netSalary)}</div>
  </div>

  <div class="signatures">
    <div>Prepared By<span></span></div>
    <div>Staff Signature<span></span></div>
  </div>
</body>
</html>`;
};

function Payslips() {
  const [staff, setStaff] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    toMonthValue(new Date())
  );
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [error, setError] = useState("");
  const detailsRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const { data } = await api.get("/staff");
        setStaff(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401) {
          return;
        }
        if (error.response?.status === 403) {
          navigate("/unauthorized", { replace: true });
          return;
        }
      }
    };
    loadStaff();
  }, []);

  useEffect(() => {
    const loadPayslips = async () => {
      const monthInfo = parseMonthValue(selectedMonth);
      if (!monthInfo) return;
      setLoading(true);
      setError("");
      try {
        const params = {
          month: monthInfo.month,
          year: monthInfo.year,
        };
        if (selectedStaffId) {
          params.staffId = selectedStaffId;
        }
        const { data } = await api.get("/payslips", { params });
        const list = Array.isArray(data) ? data : [];
        setPayslips(list);
        if (selectedPayslip) {
          const refreshed = list.find((item) => item._id === selectedPayslip._id);
          setSelectedPayslip(refreshed || null);
        }
      } catch (error) {
        if (error.response?.status === 401) {
          return;
        }
        if (error.response?.status === 403) {
          navigate("/unauthorized", { replace: true });
          return;
        }
        setError(
          error.response?.data?.message ||
            "Unable to load payslips. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };
    loadPayslips();
  }, [navigate, selectedMonth, selectedStaffId]);

  useEffect(() => {
    if (!selectedPayslip || !detailsRef.current) return;
    detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedPayslip]);

  const summaryTotals = useMemo(() => {
    return payslips.reduce(
      (acc, item) => {
        acc.totalNet += Number(item.netSalary) || 0;
        acc.totalGross += Number(item.grossSalary) || 0;
        return acc;
      },
      { totalNet: 0, totalGross: 0 }
    );
  }, [payslips]);

  const showSummary =
    !selectedPayslip && (selectedStaffId === "" || payslips.length > 1);

  const handleView = (item) => {
    setSelectedPayslip((prev) => (prev?._id === item._id ? null : item));
  };

  const handlePrint = (payslip) => {
    const printWindow = window.open("", "_blank", "width=900,height=720");
    if (!printWindow) return;
    printWindow.document.write(buildPayslipHtml(payslip));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleMarkPaid = async (payslipId) => {
    if (!payslipId) return;
    setActionLoadingId(payslipId);
    try {
      const { data } = await api.put(`/payslips/${payslipId}/mark-paid`);
      setPayslips((prev) =>
        prev.map((item) => (item._id === payslipId ? data : item))
      );
      setSelectedPayslip((prev) => (prev?._id === payslipId ? data : prev));
    } catch (error) {
      setError(
        error.response?.data?.message || "Unable to mark payslip as paid."
      );
    } finally {
      setActionLoadingId("");
    }
  };

  return (
    <div className="payslips-page">
      <div className="payslips-header">
        <div>
          <PageHeader title="Payslips" />
          <p className="payslips-subtitle">
            Official, locked salary slips for each staff member.
          </p>
        </div>
      </div>

      {error ? <p className="payslips-error">{error}</p> : null}

      <section className="payslips-card">
        <div className="payslips-card__head">
          <h2>Filters</h2>
          <p>Review payslips by month and staff member.</p>
        </div>
        <div className="payslips-filters">
          <div className="payslips-filters__fields">
            <div className="payslips-field">
              <label htmlFor="payslip-month">Month</label>
              <input
                id="payslip-month"
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              />
            </div>
            <div className="payslips-field">
              <label htmlFor="payslip-staff">Staff</label>
              <select
                id="payslip-staff"
                value={selectedStaffId}
                onChange={(event) => setSelectedStaffId(event.target.value)}
              >
                <option value="">All staff</option>
                {staff.map((member) => (
                  <option key={member._id || member.id} value={member._id || member.id}>
                    {member.fullName} - {member.roleName || "Role"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {showSummary ? (
            <div className="payslips-summary">
              <h3>Monthly Payroll Summary</h3>
              <div className="payslips-summary__row">
                <span title="Total salary before deductions">Total Gross</span>
                <strong>{formatMoney(summaryTotals.totalGross)}</strong>
              </div>
              <div className="payslips-summary__row">
                <span title="Total salary payable after deductions">Total Net</span>
                <strong>{formatMoney(summaryTotals.totalNet)}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="payslips-card">
        <div className="payslips-card__head">
          <h2>Payslip Register</h2>
          <p>{loading ? "Loading payslips..." : `${payslips.length} payslips`}</p>
        </div>
        {loading ? (
          <p className="payslips-muted">Loading payslips...</p>
        ) : payslips.length === 0 ? (
          <p className="payslips-muted">No payslips found for this period.</p>
        ) : (
          <div className="payslips-table-wrapper">
            <table className="payslips-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Role</th>
                  <th>Period</th>
                  <th>Net Salary</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((item) => (
                  <tr
                    key={item._id}
                    className={
                      selectedPayslip?._id === item._id
                        ? "payslip-row--active"
                        : ""
                    }
                  >
                    <td>{item.staffSnapshot?.name || "Staff"}</td>
                    <td>{item.staffSnapshot?.roleName || "Role"}</td>
                    <td>{formatMonthLabel(item.month, item.year)}</td>
                    <td>{formatMoney(item.netSalary)}</td>
                    <td>
                      <span
                        className={
                          item.status === "PAID"
                            ? "status-badge status-badge--paid"
                            : "status-badge status-badge--unpaid"
                        }
                      >
                        {item.status || "UNPAID"}
                      </span>
                    </td>
                    <td>
                      <div className="payslip-actions">
                        <button type="button" onClick={() => handleView(item)}>
                          View
                        </button>
                        <button type="button" onClick={() => handlePrint(item)}>
                          Print
                        </button>
                        <button type="button" onClick={() => handlePrint(item)}>
                          Download PDF
                        </button>
                        {item.status !== "PAID" ? (
                          <button
                            type="button"
                            className="payslip-action-paid"
                            onClick={() => handleMarkPaid(item._id)}
                            disabled={actionLoadingId === item._id}
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

      {selectedPayslip ? (
        <section className="payslips-card" ref={detailsRef}>
          <div className="payslips-card__head">
            <h2>Payslip Details</h2>
            <p>Review the full salary breakdown before printing.</p>
          </div>
          <div className="payslip-detail">
            <div>
              <p className="payslip-label">Staff</p>
              <h3>{selectedPayslip.staffSnapshot?.name}</h3>
              <p className="payslip-subtext">
                {selectedPayslip.staffSnapshot?.roleName} - {formatMonthLabel(
                  selectedPayslip.month,
                  selectedPayslip.year
                )}
              </p>
            </div>
            <div className="payslip-meta">
              <div>
                <span>Gross Salary</span>
                <strong>{formatMoney(selectedPayslip.grossSalary)}</strong>
              </div>
              <div>
                <span>Net Salary</span>
                <strong className="payslip-net">
                  {formatMoney(selectedPayslip.netSalary)}
                </strong>
              </div>
            </div>
          </div>
          <div className="payslip-meta payslip-meta--details">
            <div>
              <span>Working Days</span>
              <strong>{selectedPayslip.workingDays || 0}</strong>
            </div>
            <div>
              <span>Present Days</span>
              <strong>{selectedPayslip.presentDays || 0}</strong>
            </div>
            <div>
              <span>Half Days</span>
              <strong>{selectedPayslip.halfDays || 0}</strong>
            </div>
            <div>
              <span>Leave Days</span>
              <strong>{selectedPayslip.approvedLeaveDays || 0}</strong>
            </div>
            <div>
              <span>Per Day Rate</span>
              <strong>{formatMoney(selectedPayslip.perDayRate)}</strong>
            </div>
            <div>
              <span>LOP Days</span>
              <strong>{selectedPayslip.lopDays || 0}</strong>
            </div>
            <div>
              <span>LOP Amount</span>
              <strong>{formatMoney(selectedPayslip.lopAmount)}</strong>
            </div>
            <div>
              <span>Completed Jobs</span>
              <strong>{selectedPayslip.completedJobs || 0}</strong>
            </div>
            <div>
              <span>Total Labor Hours</span>
              <strong>{selectedPayslip.laborSummary?.totalLaborHours || 0}</strong>
            </div>
            <div>
              <span>Incentive Amount</span>
              <strong>
                {formatMoney(selectedPayslip.laborSummary?.incentiveAmount)}
              </strong>
            </div>
            <div>
              <span>OT Hours</span>
              <strong>
                {selectedPayslip.overtimeSummary?.approvedOtHours || 0}
              </strong>
            </div>
            <div>
              <span>OT Amount</span>
              <strong>
                {formatMoney(selectedPayslip.overtimeSummary?.otAmount)}
              </strong>
            </div>
            <div>
              <span>Allowances</span>
              <strong>
                {formatMoney(
                  (selectedPayslip.allowances?.recurringTotal || 0) +
                    (selectedPayslip.allowances?.oneOffTotal || 0)
                )}
              </strong>
            </div>
          </div>
          <div className="payslip-breakdown">
            <div>
              <h4>Earnings</h4>
              <ul>
                <li>
                  <span>Gross Earnings</span>
                  <strong>{formatMoney(selectedPayslip.grossSalary)}</strong>
                </li>
                <li>
                  <span>Allowances</span>
                  <strong>
                    {formatMoney(
                      (selectedPayslip.allowances?.recurringTotal || 0) +
                        (selectedPayslip.allowances?.oneOffTotal || 0)
                    )}
                  </strong>
                </li>
                <li>
                  <span>Incentive</span>
                  <strong>
                    {formatMoney(
                      selectedPayslip.laborSummary?.incentiveAmount
                    )}
                  </strong>
                </li>
                <li>
                  <span>Overtime</span>
                  <strong>
                    {formatMoney(
                      selectedPayslip.overtimeSummary?.otAmount
                    )}
                  </strong>
                </li>
                <li>
                  <span>Bonus</span>
                  <strong>{formatMoney(selectedPayslip.adjustments?.bonus)}</strong>
                </li>
              </ul>
            </div>
            <div>
              <h4>Deductions</h4>
              <ul>
                <li>
                  <span>LOP Amount</span>
                  <strong>{formatMoney(selectedPayslip.lopAmount)}</strong>
                </li>
                <li>
                  <span>Advance</span>
                  <strong>
                    {formatMoney(
                      selectedPayslip.adjustments?.advance ??
                        selectedPayslip.deductions?.advance
                    )}
                  </strong>
                </li>
                <li>
                  <span>Penalties</span>
                  <strong>
                    {formatMoney(
                      selectedPayslip.adjustments?.penalties ??
                        selectedPayslip.deductions?.penalties
                    )}
                  </strong>
                </li>
                <li>
                  <span>Other</span>
                  <strong>
                    {formatMoney(
                      selectedPayslip.adjustments?.other ??
                        selectedPayslip.deductions?.other
                    )}
                  </strong>
                </li>
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default Payslips;
