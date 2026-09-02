const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const sumNamedAmounts = (rows = []) =>
  rows
    .filter((entry) => entry && entry.isActive !== false)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

export const resolveSalaryType = ({ salaryModel, staffSalaryType }) => {
  if (String(salaryModel || "").toLowerCase() === "daily") return "DAILY";
  if (String(staffSalaryType || "").toUpperCase() === "PER_DAY") return "DAILY";
  return "MONTHLY";
};

export const computePayrollLineTotals = ({
  salaryType,
  workingDaysInMonth,
  presentDays,
  absentDays,
  leavePaidDays,
  leaveUnpaidDays,
  halfDays,
  basicSalaryMonthly,
  dailyRate,
  allowances = [],
  fixedDeductions = [],
}) => {
  const allowancesTotal = Number(sumNamedAmounts(allowances) || 0);
  const fixedDeductionsTotal = Number(sumNamedAmounts(fixedDeductions) || 0);
  const normalizedWorkingDays = Math.max(0, Number(workingDaysInMonth || 0));
  const normalizedPresentDays = Math.max(0, Number(presentDays || 0));
  const normalizedAbsentDays = Math.max(0, Number(absentDays || 0));
  const normalizedLeavePaidDays = Math.max(0, Number(leavePaidDays || 0));
  const normalizedLeaveUnpaidDays = Math.max(0, Number(leaveUnpaidDays || 0));
  const normalizedHalfDays = Math.max(0, Number(halfDays || 0));

  const lopDays =
    normalizedAbsentDays + normalizedLeaveUnpaidDays + normalizedHalfDays * 0.5;

  let basicSalary = 0;
  let grossPay = 0;
  let lopAmount = 0;

  if (salaryType === "DAILY") {
    const effectiveDailyRate = Math.max(0, Number(dailyRate || 0));
    const paidDays =
      normalizedPresentDays + normalizedLeavePaidDays + normalizedHalfDays * 0.5;
    basicSalary = round2(paidDays * effectiveDailyRate);
    grossPay = round2(basicSalary + allowancesTotal);
    lopAmount = 0;
  } else {
    basicSalary = round2(Math.max(0, Number(basicSalaryMonthly || 0)));
    grossPay = round2(basicSalary + allowancesTotal);
    const derivedDailyRate =
      normalizedWorkingDays > 0 ? grossPay / normalizedWorkingDays : 0;
    lopAmount = round2(derivedDailyRate * lopDays);
  }

  const totalDeductions = round2(lopAmount + fixedDeductionsTotal);
  const netPay = round2(Math.max(0, grossPay - totalDeductions));

  return {
    basicSalary: round2(basicSalary),
    allowancesTotal: round2(allowancesTotal),
    grossPay: round2(grossPay),
    lopDays: round2(lopDays),
    lopAmount: round2(lopAmount),
    fixedDeductionsTotal: round2(fixedDeductionsTotal),
    totalDeductions: round2(totalDeductions),
    netPay,
  };
};

export { round2 };
