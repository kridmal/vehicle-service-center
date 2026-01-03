import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Payroll.css";

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const parseMonthValue = (value) => {
  if (!value) return null;
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!year || !month) return null;
  return { year, month: month - 1 };
};

function Payroll() {
  const [staff, setStaff] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    toMonthValue(new Date())
  );
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [oneOffAllowances, setOneOffAllowances] = useState("");
  const [otRate, setOtRate] = useState("");
  const [bonus, setBonus] = useState("");
  const [advance, setAdvance] = useState("");
  const [penalties, setPenalties] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payslip, setPayslip] = useState(null);
  const [payslipStatus, setPayslipStatus] = useState("");
  const [payslipMessage, setPayslipMessage] = useState("");
  const [payrollRun, setPayrollRun] = useState(null);
  const [payrollMessage, setPayrollMessage] = useState("");
  const [payrollError, setPayrollError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const [staffResponse] = await Promise.all([api.get("/staff")]);
        setStaff(Array.isArray(staffResponse.data) ? staffResponse.data : []);
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
            "Unable to load payroll data. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    const loadPayslip = async () => {
      if (!selectedStaffId || !selectedMonth) {
        setPayslip(null);
        setPayslipStatus("");
        return;
      }
      const monthInfo = parseMonthValue(selectedMonth);
      if (!monthInfo) return;
      try {
        const { data } = await api.get("/payslips", {
          params: {
            staffId: selectedStaffId,
            month: monthInfo.month + 1,
            year: monthInfo.year,
          },
        });
        const existing = Array.isArray(data) ? data[0] : null;
        if (existing) {
          setPayslip(existing);
          setPayslipStatus(existing.status || "GENERATED");
          setPayslipMessage("Payslip already created for this period.");
        } else {
          setPayslip(null);
          setPayslipStatus("");
          setPayslipMessage("");
        }
      } catch (error) {
        setPayslip(null);
        setPayslipStatus("");
      }
    };
    loadPayslip();
  }, [selectedStaffId, selectedMonth]);

  useEffect(() => {
    const loadPayrollRun = async () => {
      if (!selectedStaffId || !selectedMonth) {
        setPayrollRun(null);
        setPayrollError("");
        setPayrollMessage("");
        return;
      }
      const monthInfo = parseMonthValue(selectedMonth);
      if (!monthInfo) return;
      try {
        const { data } = await api.get("/payroll-runs", {
          params: {
            staffId: selectedStaffId,
            month: monthInfo.month + 1,
            year: monthInfo.year,
          },
        });
        const existing = Array.isArray(data) ? data[0] : null;
        setPayrollRun(existing || null);
        setPayrollError("");
      } catch (loadError) {
        setPayrollRun(null);
        setPayrollError(
          loadError.response?.data?.message ||
            "Unable to load payroll run."
        );
      }
    };
    loadPayrollRun();
  }, [selectedStaffId, selectedMonth]);

  const selectedStaff = useMemo(
    () =>
      staff.find((member) => String(member._id || member.id) === selectedStaffId),
    [staff, selectedStaffId]
  );

  const normalizedBonus = Number(bonus) || 0;
  const normalizedAdvance = Number(advance) || 0;
  const normalizedPenalties = Number(penalties) || 0;
  const normalizedOther = Number(otherDeductions) || 0;
  const totalDeductions = normalizedAdvance + normalizedPenalties + normalizedOther;

  useEffect(() => {
    const calculatePayroll = async () => {
      if (!selectedStaffId || !selectedMonth) return;
      const monthInfo = parseMonthValue(selectedMonth);
      if (!monthInfo) return;
      if (payrollRun?.status === "FINALIZED") return;
      setPayrollError("");
      try {
        const { data } = await api.post("/payroll-runs", {
          staffId: selectedStaffId,
          month: monthInfo.month + 1,
          year: monthInfo.year,
          adjustments: { bonus: normalizedBonus },
          deductions: {
            advance: normalizedAdvance,
            penalties: normalizedPenalties,
            other: normalizedOther,
          },
          allowances: { oneOffTotal: Number(oneOffAllowances) || 0 },
          otRate: Number(otRate) || 0,
        });
        setPayrollRun(data);
      } catch (calcError) {
        setPayrollRun(null);
        setPayrollError(
          calcError.response?.data?.message ||
            "Unable to calculate payroll."
        );
      }
    };
    calculatePayroll();
  }, [
    selectedStaffId,
    selectedMonth,
    normalizedBonus,
    normalizedAdvance,
    normalizedPenalties,
    normalizedOther,
    oneOffAllowances,
    otRate,
    payrollRun?.status,
  ]);

  const salaryType = String(selectedStaff?.salaryType || "FIXED").toUpperCase();
  const attendanceSummary = payrollRun?.attendanceSummary || {};
  const laborSummary = payrollRun?.laborSummary || {};
  const overtimeSummary = payrollRun?.overtimeSummary || {};
  const workingDays = attendanceSummary.workingDays || 0;
  const presentDays = attendanceSummary.presentDays || 0;
  const halfDays = attendanceSummary.halfDays || 0;
  const approvedLeaveDays = attendanceSummary.approvedLeaveDays || 0;
  const lopDays = attendanceSummary.lopDays || 0;
  const lopAmount = attendanceSummary.lopAmount || 0;
  const perDayRate = Number(selectedStaff?.perDayRate) || 0;
  const completedJobs = laborSummary.completedJobs || 0;
  const totalLaborHours = laborSummary.totalLaborHours || 0;
  const incentiveAmount = laborSummary.incentiveAmount || 0;
  const otAmount = overtimeSummary.otAmount || 0;

  const grossSalary = Number(payrollRun?.grossSalary) || 0;
  const netSalary = Number(payrollRun?.netSalary) || 0;

  const totalAttendanceDays =
    presentDays + approvedLeaveDays + halfDays * 0.5;
  const attendanceNotFinalized =
    payrollError?.toLowerCase().includes("attendance not approved") ?? false;
  const payrollBlockedReason = selectedStaff ? payrollError || "" : "";
  const payrollWarning =
    payrollRun && totalAttendanceDays > workingDays
      ? "Attendance days exceed working days."
      : "";
  const showPayrollValues =
    Boolean(selectedStaff) && !payrollBlockedReason && Boolean(payrollRun);

  const isPayslipLocked = Boolean(payslip);
  const isPayrollFinalized = payrollRun?.status === "FINALIZED";
  const canGeneratePayslip =
    Boolean(selectedStaff) &&
    !isPayslipLocked &&
    !payrollBlockedReason &&
    isPayrollFinalized;

  const handleFinalizePayroll = async () => {
    if (!payrollRun?._id) return;
    setLoading(true);
    setPayrollMessage("");
    setPayrollError("");
    try {
      const { data } = await api.put(
        `/payroll-runs/${payrollRun._id}/finalize`
      );
      setPayrollRun(data);
      setPayrollMessage("Payroll finalized and locked.");
    } catch (finalizeError) {
      setPayrollError(
        finalizeError.response?.data?.message ||
          "Unable to finalize payroll."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePayslip = async () => {
    if (!selectedStaff) return;
    const monthInfo = parseMonthValue(selectedMonth);
    if (!monthInfo) return;
    setLoading(true);
    setPayslipMessage("");
    try {
      const payload = {
        payrollRunId: payrollRun?._id,
        staffId: selectedStaff._id || selectedStaff.id,
        month: monthInfo.month + 1,
        year: monthInfo.year,
      };
      const { data } = await api.post("/payslips", payload);
      setPayslip(data);
      setPayslipStatus(data.status || "GENERATED");
      setPayslipMessage("Payslip created and locked.");
    } catch (error) {
      setPayslipMessage(
        error.response?.data?.message || "Unable to generate payslip."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payroll-page">
      <div className="payroll-header">
        <div>
          <PageHeader title="Payroll" />
          <p className="payroll-subtitle">
            Calculate salaries from completed job cards.
          </p>
        </div>
      </div>

      {error ? <p className="payroll-error">{error}</p> : null}

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Payroll Filters</h2>
          <p>Select the month and staff member to calculate payroll.</p>
        </div>
        <div className="payroll-filters">
          <div className="payroll-field">
            <label htmlFor="payroll-month">Month</label>
            <input
              id="payroll-month"
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              disabled={isPayslipLocked}
            />
          </div>
          <div className="payroll-field">
            <label htmlFor="payroll-staff">Staff Member</label>
            <select
              id="payroll-staff"
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              disabled={isPayslipLocked}
            >
              <option value="">Select staff</option>
              {staff.map((member) => (
                <option key={member._id || member.id} value={member._id || member.id}>
                  {member.fullName} - {member.roleName || "Role"}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <p className="payroll-muted">Loading payroll data...</p>
        ) : selectedStaff ? (
          <div className="payroll-summary">
            <div className="payroll-summary__card">
              <span>Completed Jobs</span>
              <strong>{showPayrollValues ? completedJobs : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>Working Days</span>
              <strong>{showPayrollValues ? workingDays : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>Present Days</span>
              <strong>{showPayrollValues ? presentDays : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>Half Days</span>
              <strong>
                {showPayrollValues ? halfDays : "-"}
              </strong>
            </div>
            <div className="payroll-summary__card">
              <span>Leave Days</span>
              <strong>{showPayrollValues ? approvedLeaveDays : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>LOP Days</span>
              <strong>
                {salaryType === "PER_DAY"
                  ? "N/A"
                  : showPayrollValues
                  ? lopDays
                  : "-"}
              </strong>
            </div>
            <div className="payroll-summary__card">
              <span>LOP Amount</span>
              <strong>
                {salaryType === "PER_DAY"
                  ? "N/A"
                  : showPayrollValues
                  ? lopAmount.toFixed(2)
                  : "-"}
              </strong>
            </div>
            <div className="payroll-summary__card">
              <span>Total Labor Hours</span>
              <strong>
                {salaryType === "FIXED" && showPayrollValues
                  ? totalLaborHours.toFixed(2)
                  : "-"}
              </strong>
            </div>
            <div className="payroll-summary__card">
              <span>Incentive Amount</span>
              <strong>
                {salaryType === "FIXED" && showPayrollValues
                  ? incentiveAmount.toFixed(2)
                  : "-"}
              </strong>
            </div>
            <div className="payroll-summary__card">
              <span>OT Amount</span>
              <strong>{showPayrollValues ? otAmount.toFixed(2) : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>Per Day Rate</span>
              <strong>
                {salaryType === "PER_DAY" && showPayrollValues
                  ? perDayRate.toFixed(2)
                  : "-"}
              </strong>
            </div>
            <div className="payroll-summary__card">
              <span>Gross Earnings</span>
              <strong>{showPayrollValues ? grossSalary.toFixed(2) : "-"}</strong>
            </div>
          </div>
        ) : (
          <p className="payroll-muted">Select a staff member to view payroll.</p>
        )}
        {payrollBlockedReason ? (
          <p className={attendanceNotFinalized ? "payroll-warning" : "payroll-error"}>
            {payrollBlockedReason}
          </p>
        ) : null}
        {payrollWarning ? (
          <p className="payroll-warning">{payrollWarning}</p>
        ) : null}
      </section>

      <section className="payroll-card">
        <div className="payroll-card__head">
          <h2>Adjustments</h2>
          <p>Add manual bonuses or deductions for the final payout.</p>
        </div>
        <div className="payroll-adjustments">
          <div className="payroll-field">
            <label htmlFor="payroll-ot-rate">OT Rate</label>
            <input
              id="payroll-ot-rate"
              type="number"
              min="0"
              value={otRate}
              onChange={(event) => setOtRate(event.target.value)}
              disabled={!selectedStaff || isPayrollFinalized}
            />
          </div>
          <div className="payroll-field">
            <label htmlFor="payroll-allowances">One-Off Allowance</label>
            <input
              id="payroll-allowances"
              type="number"
              min="0"
              value={oneOffAllowances}
              onChange={(event) => setOneOffAllowances(event.target.value)}
              disabled={!selectedStaff || isPayrollFinalized}
            />
          </div>
          <div className="payroll-field">
            <label htmlFor="payroll-bonus">Bonus</label>
            <input
              id="payroll-bonus"
              type="number"
              min="0"
              value={bonus}
              onChange={(event) => setBonus(event.target.value)}
              disabled={!selectedStaff || isPayrollFinalized}
            />
          </div>
          <div className="payroll-field">
            <label htmlFor="payroll-advance">Advance</label>
            <input
              id="payroll-advance"
              type="number"
              min="0"
              value={advance}
              onChange={(event) => setAdvance(event.target.value)}
              disabled={!selectedStaff || isPayrollFinalized}
            />
          </div>
          <div className="payroll-field">
            <label htmlFor="payroll-penalties">Penalties</label>
            <input
              id="payroll-penalties"
              type="number"
              min="0"
              value={penalties}
              onChange={(event) => setPenalties(event.target.value)}
              disabled={!selectedStaff || isPayrollFinalized}
            />
          </div>
          <div className="payroll-field">
            <label htmlFor="payroll-other-deductions">Other Deductions</label>
            <input
              id="payroll-other-deductions"
              type="number"
              min="0"
              value={otherDeductions}
              onChange={(event) => setOtherDeductions(event.target.value)}
              disabled={!selectedStaff || isPayrollFinalized}
            />
          </div>
          <div className="payroll-field payroll-field--net">
            <span>Net Salary</span>
            <strong>{showPayrollValues ? netSalary.toFixed(2) : "-"}</strong>
          </div>
        </div>
        <div className="payroll-actions">
          <div className="payroll-actions__buttons">
            <button
              type="button"
              onClick={handleFinalizePayroll}
              disabled={!payrollRun || isPayrollFinalized || loading}
            >
              Finalize Payroll
            </button>
            <button
              type="button"
              onClick={handleGeneratePayslip}
              disabled={!canGeneratePayslip || loading}
            >
              Generate Payslip
            </button>
            <button
              type="button"
              className="payroll-actions__secondary"
              onClick={() => navigate("/payslips")}
            >
              View Payslips
            </button>
          </div>
          {payrollRun ? (
            <span className="payroll-lock">
              Payroll {payrollRun.status?.toLowerCase() || "draft"} for this
              period.
            </span>
          ) : null}
          {payslip ? (
            <span className="payroll-lock">
              Payslip {payslipStatus.toLowerCase()} for this period.
            </span>
          ) : null}
        </div>
        {payrollMessage ? (
          <p
            className={
              payrollMessage.includes("finalized")
                ? "payroll-success"
                : "payroll-error"
            }
          >
            {payrollMessage}
          </p>
        ) : null}
        {payslipMessage ? (
          <p
            className={
              payslipMessage.includes("generated")
                ? "payroll-success"
                : "payroll-error"
            }
          >
            {payslipMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}

export default Payroll;


