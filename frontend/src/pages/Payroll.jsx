import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Payroll.css";

const COMPLETED_STATUSES = new Set(["COMPLETED", "CLOSED"]);

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
  const [jobCards, setJobCards] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    toMonthValue(new Date())
  );
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [bonus, setBonus] = useState("");
  const [advance, setAdvance] = useState("");
  const [penalties, setPenalties] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payslip, setPayslip] = useState(null);
  const [payslipStatus, setPayslipStatus] = useState("");
  const [payslipMessage, setPayslipMessage] = useState("");
  const [attendanceRecord, setAttendanceRecord] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const [staffResponse, jobsResponse] = await Promise.all([
          api.get("/staff"),
          api.get("/job-cards"),
        ]);
        setStaff(Array.isArray(staffResponse.data) ? staffResponse.data : []);
        setJobCards(Array.isArray(jobsResponse.data) ? jobsResponse.data : []);
      } catch (error) {
        if (error.response?.status === 401) {
          navigate("/login", { replace: true });
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
  }, [navigate]);

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
    const loadAttendance = async () => {
      if (!selectedStaffId || !selectedMonth) {
        setAttendanceRecord(null);
        return;
      }
      const monthInfo = parseMonthValue(selectedMonth);
      if (!monthInfo) return;
      try {
        const { data } = await api.get("/attendance", {
          params: {
            staffId: selectedStaffId,
            month: monthInfo.month + 1,
            year: monthInfo.year,
          },
        });
        const records = Array.isArray(data?.records) ? data.records : [];
        setAttendanceRecord(records[0] || null);
      } catch (error) {
        setAttendanceRecord(null);
      }
    };
    loadAttendance();
  }, [selectedStaffId, selectedMonth]);

  const selectedStaff = useMemo(
    () =>
      staff.find((member) => String(member._id || member.id) === selectedStaffId),
    [staff, selectedStaffId]
  );

  const payrollSnapshot = useMemo(() => {
    if (!selectedStaff) {
      return {
        jobCount: 0,
        laborTotal: 0,
        baseSalary: 0,
      };
    }

    const monthInfo = parseMonthValue(selectedMonth);
    const staffId = String(selectedStaff._id || selectedStaff.id || "");
    const staffName = String(selectedStaff.fullName || "").toLowerCase();

    let jobCount = 0;
    let laborTotal = 0;
    jobCards.forEach((job) => {
      if (!COMPLETED_STATUSES.has(job.status)) return;
      const createdAt = job.createdAt ? new Date(job.createdAt) : null;
      if (!createdAt || !monthInfo) return;
      if (
        createdAt.getFullYear() !== monthInfo.year ||
        createdAt.getMonth() !== monthInfo.month
      ) {
        return;
      }

      const assignments = Array.isArray(job.assignedWorkers)
        ? job.assignedWorkers
        : [];
      if (assignments.length === 0) return;

      const hasMatch = assignments.some((entry) => {
        const entryId = String(entry?.staffId || entry?.workerId || "");
        if (entryId && entryId === staffId) return true;
        if (!entryId && entry?.name) {
          return String(entry.name).toLowerCase() === staffName;
        }
        return false;
      });

      if (!hasMatch) return;

      jobCount += 1;
      const laborCharges = Number(job.laborCharges) || 0;
      const split = laborCharges / assignments.length;
      laborTotal += split;
    });

    const baseSalary = Number(selectedStaff.basicSalary) || 0;

    return {
      jobCount,
      laborTotal,
      baseSalary,
    };
  }, [jobCards, selectedMonth, selectedStaff]);

  const normalizedBonus = Number(bonus) || 0;
  const normalizedAdvance = Number(advance) || 0;
  const normalizedPenalties = Number(penalties) || 0;
  const normalizedOther = Number(otherDeductions) || 0;
  const totalDeductions = normalizedAdvance + normalizedPenalties + normalizedOther;

  const salaryType = String(selectedStaff?.salaryType || "FIXED").toUpperCase();
  const attendanceRequired = ["FIXED", "PER_DAY", "HYBRID"].includes(salaryType);
  const isPerDaySalary = salaryType === "PER_DAY";
  const workingDays = attendanceRecord?.workingDays || 0;
  const presentDays = attendanceRecord?.presentDays || 0;
  const halfDays = attendanceRecord?.halfDays || 0;
  const approvedLeaveDays = attendanceRecord?.approvedLeaveDays || 0;
  const lopDays = isPerDaySalary ? 0 : attendanceRecord?.lopDays || 0;
  const lopAmount = isPerDaySalary ? 0 : attendanceRecord?.lopAmount || 0;
  const perDayRate = Number(selectedStaff?.perDayRate) || 0;
  const commissionRate = Number(selectedStaff?.commissionPercentage) || 0;
  const commissionAmount = (commissionRate / 100) * payrollSnapshot.laborTotal;
  const perDayEarnings = presentDays * perDayRate + halfDays * perDayRate * 0.5;
  const baseAfterLop = Math.max(0, payrollSnapshot.baseSalary - lopAmount);
  const basePay =
    salaryType === "PER_DAY"
      ? perDayEarnings
      : salaryType === "COMMISSION"
      ? commissionAmount
      : salaryType === "HYBRID"
      ? baseAfterLop + commissionAmount
      : baseAfterLop;
  const grossSalary = basePay;
  const netSalary = Math.max(0, grossSalary + normalizedBonus - totalDeductions);

  const totalAttendanceDays =
    presentDays + approvedLeaveDays + halfDays * 0.5;
  const payrollBlockedReason = selectedStaff
    ? attendanceRequired && !attendanceRecord
      ? "Attendance not marked for this period"
      : salaryType === "PER_DAY" && perDayRate <= 0
      ? "Per day rate is required for PER_DAY"
      : ""
    : "";
  const payrollWarning =
    attendanceRecord && totalAttendanceDays > workingDays
      ? "Attendance days exceed working days."
      : "";
  const showPayrollValues = Boolean(selectedStaff) && !payrollBlockedReason;

  const isPayslipLocked = Boolean(payslip);
  const canGeneratePayslip =
    Boolean(selectedStaff) && !isPayslipLocked && !payrollBlockedReason;

  const handleGeneratePayslip = async () => {
    if (!selectedStaff) return;
    const monthInfo = parseMonthValue(selectedMonth);
    if (!monthInfo) return;
    setLoading(true);
    setPayslipMessage("");
    try {
      const payload = {
        staffId: selectedStaff._id || selectedStaff.id,
        month: monthInfo.month + 1,
        year: monthInfo.year,
        workingDays,
        perDayRate,
        presentDays,
        halfDays,
        approvedLeaveDays,
        lopDays,
        lopAmount,
        completedJobs: payrollSnapshot.jobCount,
        grossSalary,
        netSalary,
        adjustments: {
          bonus: normalizedBonus,
          advance: normalizedAdvance,
          penalties: normalizedPenalties,
          other: normalizedOther,
        },
        earnings: {
          baseSalary: grossSalary,
          laborShare: 0,
          commission: commissionAmount,
          bonus: normalizedBonus,
        },
        deductions: {
          advance: normalizedAdvance,
          penalties: normalizedPenalties,
          other: normalizedOther,
        },
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
              <strong>{payrollSnapshot.jobCount}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>Working Days</span>
              <strong>{attendanceRecord ? workingDays : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>Present Days</span>
              <strong>{attendanceRecord ? presentDays : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
              <span>Half Days</span>
              <strong>
                {attendanceRecord ? halfDays : "-"}
              </strong>
            </div>
            <div className="payroll-summary__card">
              <span>Leave Days</span>
              <strong>{attendanceRecord ? approvedLeaveDays : "-"}</strong>
            </div>
            <div className="payroll-summary__card">
                  <span>LOP Days</span>
                  <strong>
                    {salaryType === "PER_DAY"
                      ? "N/A"
                      : attendanceRecord
                      ? lopDays
                      : "-"}
                  </strong>
                </div>
                <div className="payroll-summary__card">
                  <span>LOP Amount</span>
                  <strong>
                    {salaryType === "PER_DAY"
                      ? "N/A"
                      : attendanceRecord
                      ? lopAmount.toFixed(2)
                      : "-"}
                  </strong>
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
          <p className="payroll-error">{payrollBlockedReason}</p>
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
            <label htmlFor="payroll-bonus">Bonus</label>
            <input
              id="payroll-bonus"
              type="number"
              min="0"
              value={bonus}
              onChange={(event) => setBonus(event.target.value)}
              disabled={!selectedStaff || isPayslipLocked}
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
              disabled={!selectedStaff || isPayslipLocked}
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
              disabled={!selectedStaff || isPayslipLocked}
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
              disabled={!selectedStaff || isPayslipLocked}
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
          {payslip ? (
            <span className="payroll-lock">
              Payslip {payslipStatus.toLowerCase()} for this period.
            </span>
          ) : null}
        </div>
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


