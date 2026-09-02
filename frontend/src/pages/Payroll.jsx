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

  // OT review step state
  const [otPreview, setOtPreview] = useState(null); // { preview: [...], targetHours }
  const [otAmounts, setOtAmounts] = useState({});   // { [staffId]: string }
  const [otReviewVisible, setOtReviewVisible] = useState(false);

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
  };

  useEffect(() => {
    setLoading(true);
    setOtReviewVisible(false);
    setOtPreview(null);
    setOtAmounts({});
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

  // Step 1: fetch OT preview, show review table
  const startGenerate = async () => {
    if (!monthPast) return;
    if (run?.status === "DRAFT") {
      const ok = window.confirm(
        "A draft payroll run already exists for this month. Regenerate and replace it?"
      );
      if (!ok) return;
    }
    setActionLoading("preview");
    setError("");
    setMessage("");
    try {
      const { year, month: monthNumber } = parseMonthValue(month);
      const { data } = await api.get("/payroll/ot-preview", {
        params: { year, month: monthNumber },
      });
      setOtPreview(data);
      setOtAmounts({});
      setOtReviewVisible(true);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load OT preview.");
    } finally {
      setActionLoading("");
    }
  };

  // Step 2: confirm with manual OT amounts and generate
  const confirmGenerate = async () => {
    const { year, month: monthNumber } = parseMonthValue(month);
    const regenerate = run?.status === "DRAFT";
    setActionLoading("generate");
    setError("");
    setMessage("");
    try {
      // Convert string inputs to numbers; omit zeros to keep payload clean
      const otAmountsPayload = {};
      for (const [staffId, raw] of Object.entries(otAmounts)) {
        const val = Number(raw || 0);
        if (val > 0) otAmountsPayload[staffId] = val;
      }
      const { data } = await api.post("/payroll/generate", {
        year,
        month: monthNumber,
        regenerate,
        otAmounts: otAmountsPayload,
      });
      setMessage(
        `Payroll ${regenerate ? "regenerated" : "generated"} for ${month}. ${data.lineCount || 0} employees.`
      );
      setOtReviewVisible(false);
      setOtPreview(null);
      setOtAmounts({});
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
        Process: 1) Finalize attendance 2) Review OT &amp; Generate payroll 3) Mark payments.
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

        {otReviewVisible && otPreview ? (
          <>
            <p className="payroll-note">
              Review calculated OT hours below. Enter a manual OT amount (LKR) for any employee who earned overtime — leave blank or 0 for none.
            </p>
            <div className="payroll-table-wrap">
              <table className="payroll-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Labor Hours</th>
                    <th>Target Hours</th>
                    <th>OT Hours</th>
                    <th>OT Amount (LKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {otPreview.preview.map((entry) => (
                    <tr key={entry.staffId}>
                      <td data-label="Employee">{entry.name}</td>
                      <td data-label="Labor Hours">{entry.monthlyLaborHours}</td>
                      <td data-label="Target Hours">{entry.targetHours}</td>
                      <td data-label="OT Hours">{entry.overtimeHours}</td>
                      <td data-label="OT Amount (LKR)">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={otAmounts[entry.staffId] ?? ""}
                          onChange={(e) =>
                            setOtAmounts((prev) => ({
                              ...prev,
                              [entry.staffId]: e.target.value,
                            }))
                          }
                          style={{ width: "120px" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="payroll-actions">
              <button
                type="button"
                className="payroll-actions__secondary"
                onClick={() => {
                  setOtReviewVisible(false);
                  setOtPreview(null);
                  setOtAmounts({});
                }}
                disabled={actionLoading === "generate"}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmGenerate}
                disabled={actionLoading === "generate"}
              >
                {actionLoading === "generate"
                  ? "Generating…"
                  : run?.status === "DRAFT"
                  ? "Confirm & Regenerate"
                  : "Confirm & Generate"}
              </button>
            </div>
          </>
        ) : (
          <div className="payroll-actions">
            <button
              type="button"
              onClick={startGenerate}
              disabled={
                !monthPast ||
                !calendarFound ||
                !finalization?.finalized ||
                actionLoading === "preview"
              }
            >
              {actionLoading === "preview"
                ? "Loading…"
                : run?.status === "DRAFT"
                ? "Regenerate Payroll"
                : "Generate Payroll"}
            </button>
          </div>
        )}
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
                    <td data-label="Employee">{line.staffSnapshot?.name}</td>
                    <td data-label="Salary Type">{line.salaryType}</td>
                    <td data-label="Working Days">{line.calendarSummary?.workingDaysInMonth || 0}</td>
                    <td data-label="Present">{line.attendanceSummary?.presentDays || 0}</td>
                    <td data-label="Absent">{line.attendanceSummary?.absentDays || 0}</td>
                    <td data-label="LOP Days">{line.deductions?.lopDays || 0}</td>
                    <td data-label="OT Amount">{formatMoney(line.payComponents?.otAmount)}</td>
                    <td data-label="Advance Deduction">{formatMoney(line.advanceDeduction?.advanceDeductionTotal)}</td>
                    <td data-label="Gross">{formatMoney(line.payComponents?.grossPay)}</td>
                    <td data-label="Deductions">{formatMoney(line.deductions?.totalDeductions)}</td>
                    <td data-label="Net Pay">{formatMoney(line.netPay)}</td>
                    <td data-label="Status">{line.paymentStatus}</td>
                    <td data-label="Action">
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
