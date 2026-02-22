import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMonthlyCutoff,
  summarizeEvaluatedAttendance,
} from "../src/utils/attendanceReport.js";

test("resolveMonthlyCutoff excludes future days for current month", () => {
  const today = new Date("2026-02-10T09:00:00");
  const result = resolveMonthlyCutoff({ year: 2026, month: 2, today });

  assert.equal(result.isFutureMonth, false);
  assert.equal(result.cutoffDate, "2026-02-10");
});

test("summarizeEvaluatedAttendance counts missing days as unmarked, not absent", () => {
  const evaluatedDates = ["2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04"];
  const attendanceByDate = new Map([
    ["2026-02-01", { status: "present" }],
    ["2026-02-02", { status: "absent" }],
    ["2026-02-03", { status: "on-leave", leaveTypeId: "UNPAID_LEAVE_TYPE" }],
  ]);

  const summary = summarizeEvaluatedAttendance({
    evaluatedDates,
    attendanceByDate,
    unpaidLeaveTypeIds: new Set(["UNPAID_LEAVE_TYPE"]),
  });

  assert.equal(summary.workingDaysEvaluated, 4);
  assert.equal(summary.presentCount, 1);
  assert.equal(summary.absentCount, 1);
  assert.equal(summary.leaveCount, 1);
  assert.equal(summary.unmarkedCount, 1);
  assert.equal(summary.lopDays, 2);
});
