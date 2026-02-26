import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Payroll.css";

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const parseMonthValue = (value) => ({
  year: Number(String(value || "").slice(0, 4)),
  month: Number(String(value || "").slice(5, 7)),
});

const isPastMonth = (monthValue) => {
  const { year, month } = parseMonthValue(monthValue);
  const now = new Date();
  const selected = year * 100 + month;
  const current = now.getFullYear() * 100 + (now.getMonth() + 1);
  return selected < current;
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function Payroll() {
  const [month, setMonth] = useState(toMonthValue(new Date()));
  const [calendarFound, setCalendarFound] = useState(false);
  const [finalization, setFinalization] = useState(null);
  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [otEnabled, setOtEnabled] = useState(false);

  const monthPast = useMemo(() => isPastMonth(month), [month]);

  const load = async () => {
    const { year, month: monthNumber } = parseMonthValue(month);
    const [calendarRes, finalizationRes, payrollRes] = await Promise.all([
      api.get("/work-calendar", { params: { year, month: monthNumber } }),
      api.get("/attendance/finalization-status", { params: { year, month: monthNumber } }),
      api.get("/payroll", { params: { year, month: monthNumber } }),
    ]);

    setCalendarFound(Array.isArray(calendarRes.data) && calendarRes.data.length > 0);
    setFinalization(finalizationRes.data || null);
    setRun(payrollRes.data?.run || null);
    setLines(Array.isArray(payrollRes.data?.lines) ? payrollRes.data.lines : []);
    if (payrollRes.data?.run?.otEnabled !== undefined) {
      setOtEnabled(Boolean(payrollRes.data.run.otEnabled));
    }
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err.response?.data?.message || "Unable to load payroll data."))
      .finally(() => setLoading(false));
  }, [month]);

  const finalizeAttendance = async () => {
    if (!monthPast) return;
    const confirm = window.confirm(
      "This will mark all unmarked working days as ABSENT. Continue?"
    );
    if (!confirm) return;

    const { year, month: monthNumber } = parseMonthValue(month);
    setActionLoading("finalize");
    setError("");
    setMessage("");
    try {
      const { data } = await api.post("/attendance/finalize-month", {
        year,
        month: monthNumber,
        mode: "CONVERT_UNMARKED_TO_ABSENT",
      });
      setMessage(`Attendance finalized. Auto-marked ${data.createdCount || 0} entries.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to finalize attendance.");
    } finally {
      setActionLoading("");
    }
  };

  const generatePayroll = async () => {
    if (!monthPast) return;
    const { year, month: monthNumber } = parseMonthValue(month);
    const regenerate = run?.status === "DRAFT";
    if (regenerate) {
      const shouldRegenerate = window.confirm(
        "A draft payroll run already exists for this month. Regenerate and replace it?"
      );
      if (!shouldRegenerate) return;
    }
    setActionLoading("generate");
    setError("");
    setMessage("");
    try {
      const { data } = await api.post("/payroll/generate", {
        year,
        month: monthNumber,
        otEnabled,
        regenerate,
      });
      setMessage(
        `Payroll ${regenerate ? "regenerated" : "generated"} for ${month}. ${
          data.lineCount || 0
        } employees. OT ${
          otEnabled ? "enabled" : "disabled"
        }.`
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to generate payroll.");
    } finally {
      setActionLoading("");
    }
  };

  const markLinePaid = async (staffId) => {
    if (!run?._id || !staffId) return;
    setActionLoading(String(staffId));
    setError("");
    setMessage("");
    try {
      await api.put(`/payroll/${run._id}/mark-paid`, {
        staffIds: [staffId],
        paidAt: new Date().toISOString(),
      });
      setMessage("Payment status updated.");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to mark payment.");
    } finally {
      setActionLoading("");
    }
  };

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, line) => {
          acc.gross += Number(line.payComponents?.grossPay || 0);
          acc.deductions += Number(line.deductions?.totalDeductions || 0);
          acc.net += Number(line.netPay || 0);
          return acc;
        },
        { gross: 0, deductions: 0, net: 0 }
      ),
    [lines]
  );

  return (
    <div className="payroll-page">
      <div className="payroll-header">
        <div>
          <PageHeader title="Payroll" />
          <p className="payroll-subtitle">Finalize attendance, generate payroll, and mark payments.</p>
        </div>
      </div>
      {error ? <p className="payroll-error">{error}</p> : null}
      {message ? <p className="payroll-success">{message}</p> : null}
      <p className="payroll-warning">
        Process: 1) Finalize attendance 2) Generate payroll 3) Mark payments.
      </p>

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Month Selection</h2>
        </div>
        <div className="payroll-filters">
          <div className="payroll-field">
            <label>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Month End Status</span>
            <strong>{monthPast ? "Ended" : "Not Ended"}</strong>
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Payroll Run</span>
            <strong>{run?.status || "Not Generated"}</strong>
          </div>
        </div>
        {!monthPast ? (
          <p className="payroll-note">Payroll can be generated after month end.</p>
        ) : null}
      </section>

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Calendar Status</h2>
        </div>
        <p className={calendarFound ? "payroll-ok" : "payroll-note"}>
          {calendarFound ? "Work calendar found for selected month." : "Work calendar missing for selected month."}
        </p>
      </section>

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Attendance Finalization</h2>
        </div>
        <p className={finalization?.finalized ? "payroll-ok" : "payroll-note"}>
          {finalization?.finalized
            ? `Finalized on ${new Date(finalization.finalizedAt).toLocaleString()} by ${
                finalization.finalizedBy || "-"
              }`
            : "Not finalized for selected month."}
        </p>
        <div className="payroll-actions">
          <button
            type="button"
            onClick={finalizeAttendance}
            disabled={!monthPast || !calendarFound || Boolean(finalization?.finalized) || actionLoading === "finalize"}
          >
            Finalize Attendance for Month
          </button>
        </div>
      </section>

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Generate Payroll</h2>
        </div>
        <div className="payroll-field">
          <label className="payroll-toggle">
            <input
              type="checkbox"
              checked={otEnabled}
              onChange={(event) => setOtEnabled(event.target.checked)}
              disabled={actionLoading === "generate"}
            />
            <span>Enable OT/Incentive for this payroll run</span>
          </label>
        </div>
        <div className="payroll-actions">
          <button
            type="button"
            onClick={generatePayroll}
            disabled={!monthPast || !calendarFound || !finalization?.finalized || actionLoading === "generate"}
          >
            {run?.status === "DRAFT" ? "Regenerate Payroll" : "Generate Payroll"}
          </button>
        </div>
      </section>

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Payroll Lines</h2>
          <p>{loading ? "Loading..." : `${lines.length} employees`}</p>
        </div>
        <div className="payroll-filters">
          <div className="payroll-field payroll-field--net">
            <span>Total Gross</span>
            <strong>{formatMoney(run?.totals?.totalGross ?? totals.gross)}</strong>
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Total Deductions</span>
            <strong>{formatMoney(run?.totals?.totalDeductions ?? totals.deductions)}</strong>
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Total Net</span>
            <strong>{formatMoney(run?.totals?.totalNet ?? totals.net)}</strong>
          </div>
        </div>
        {!lines.length ? (
          <p className="payroll-muted">No payroll generated for selected month.</p>
        ) : (
          <div className="payroll-table-wrap">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Salary Type</th>
                  <th>Working Days</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>LOP Days</th>
                  <th>Labor Hours</th>
                  <th>Target Hours</th>
                  <th>OT Hours</th>
                  <th>OT Amount</th>
                  <th>Advance Deduction</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Payment Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line._id}>
                    <td>{line.staffSnapshot?.name}</td>
                    <td>{line.salaryType}</td>
                    <td>{line.calendarSummary?.workingDaysInMonth || 0}</td>
                    <td>{line.attendanceSummary?.presentDays || 0}</td>
                    <td>{line.attendanceSummary?.absentDays || 0}</td>
                    <td>{line.deductions?.lopDays || 0}</td>
                    <td>{line.performanceSummary?.monthlyLaborHours || 0}</td>
                    <td>{line.performanceSummary?.targetHours || 0}</td>
                    <td>{line.performanceSummary?.overtimeHours || 0}</td>
                    <td>{formatMoney(line.performanceSummary?.otAmount)}</td>
                    <td>{formatMoney(line.advanceDeduction?.advanceDeductionTotal)}</td>
                    <td>{formatMoney(line.payComponents?.grossPay)}</td>
                    <td>{formatMoney(line.deductions?.totalDeductions)}</td>
                    <td>{formatMoney(line.netPay)}</td>
                    <td>{line.paymentStatus}</td>
                    <td>
                      <div className="payroll-actions__buttons">
                        <button
                          type="button"
                          className="payroll-actions__secondary"
                          onClick={() =>
                            setMessage(
                              `Payslip view for ${line.staffSnapshot?.name} is available in next phase.`
                            )
                          }
                        >
                          View Payslip
                        </button>
                        {line.paymentStatus !== "PAID" ? (
                          <button
                            type="button"
                            onClick={() => markLinePaid(line.staffId)}
                            disabled={actionLoading === String(line.staffId)}
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
    </div>
  );
}

export default Payroll;
