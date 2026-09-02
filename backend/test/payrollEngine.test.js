import assert from "node:assert/strict";
import test from "node:test";
import { computePayrollLineTotals, resolveSalaryType } from "../src/utils/payrollEngine.js";

test("resolveSalaryType maps fixed/per-day correctly", () => {
  assert.equal(resolveSalaryType({ salaryModel: "fixed", staffSalaryType: "FIXED" }), "MONTHLY");
  assert.equal(resolveSalaryType({ salaryModel: "daily", staffSalaryType: "FIXED" }), "DAILY");
  assert.equal(resolveSalaryType({ salaryModel: "", staffSalaryType: "PER_DAY" }), "DAILY");
});

test("computePayrollLineTotals for monthly applies lop from gross/workingDays", () => {
  const result = computePayrollLineTotals({
    salaryType: "MONTHLY",
    workingDaysInMonth: 20,
    presentDays: 16,
    absentDays: 2,
    leavePaidDays: 1,
    leaveUnpaidDays: 0,
    halfDays: 1,
    basicSalaryMonthly: 100000,
    dailyRate: 0,
    allowances: [{ name: "Transport", amount: 5000 }],
    fixedDeductions: [{ name: "Loan", amount: 2000 }],
  });

  assert.equal(result.grossPay, 105000);
  assert.equal(result.lopDays, 2.5);
  assert.equal(result.lopAmount, 13125);
  assert.equal(result.totalDeductions, 15125);
  assert.equal(result.netPay, 89875);
});

test("computePayrollLineTotals for daily pays only payable days and no lop deduction", () => {
  const result = computePayrollLineTotals({
    salaryType: "DAILY",
    workingDaysInMonth: 22,
    presentDays: 15,
    absentDays: 3,
    leavePaidDays: 2,
    leaveUnpaidDays: 1,
    halfDays: 2,
    basicSalaryMonthly: 0,
    dailyRate: 3000,
    allowances: [{ name: "Allowance", amount: 1000 }],
    fixedDeductions: [{ name: "Tax", amount: 500 }],
  });

  assert.equal(result.basicSalary, 54000);
  assert.equal(result.grossPay, 55000);
  assert.equal(result.lopDays, 5);
  assert.equal(result.lopAmount, 0);
  assert.equal(result.totalDeductions, 500);
  assert.equal(result.netPay, 54500);
});
