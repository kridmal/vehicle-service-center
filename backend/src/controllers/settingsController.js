import AppSetting from "../models/AppSetting.js";
import { logAudit } from "../utils/audit.js";

const DEFAULT_SETTINGS = {
  attendanceRules: {
    lateThresholdTime: "09:00",
    halfDayMinimumHours: 4,
    defaultWorkingHours: 8,
  },
  payrollSettings: {
    standardDailyHours: 8,
    otRatePerHour: 0,
  },
  salaryComponents: {
    allowances: [
      { id: "transport", name: "Transport Allowance", defaultAmount: 0 },
      { id: "meal", name: "Meal Allowance", defaultAmount: 0 },
      { id: "attendance", name: "Attendance Allowance", defaultAmount: 0 },
    ],
    deductions: [
      { id: "epf", name: "EPF", defaultAmount: 0 },
      { id: "etf", name: "ETF", defaultAmount: 0 },
      { id: "advance", name: "Advance Recovery", defaultAmount: 0 },
    ],
  },
};

export const getSettings = async (req, res, next) => {
  try {
    const rows = await AppSetting.find({
      key: { $in: ["attendanceRules", "payrollSettings", "salaryComponents"] },
    });
    const map = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    return res.json({
      attendanceRules: map.attendanceRules || DEFAULT_SETTINGS.attendanceRules,
      payrollSettings: map.payrollSettings || DEFAULT_SETTINGS.payrollSettings,
      salaryComponents:
        map.salaryComponents || DEFAULT_SETTINGS.salaryComponents,
    });
  } catch (error) {
    return next(error);
  }
};

export const upsertSettings = async (req, res, next) => {
  try {
    const updates = req.body || {};
    const result = {};
    if (updates.attendanceRules) {
      const row = await AppSetting.findOneAndUpdate(
        { key: "attendanceRules" },
        { value: updates.attendanceRules },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      result.attendanceRules = row.value;
    }
    if (updates.payrollSettings) {
      const row = await AppSetting.findOneAndUpdate(
        { key: "payrollSettings" },
        { value: updates.payrollSettings },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      result.payrollSettings = row.value;
    }
    if (updates.salaryComponents) {
      const row = await AppSetting.findOneAndUpdate(
        { key: "salaryComponents" },
        { value: updates.salaryComponents },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      result.salaryComponents = row.value;
    }
    await logAudit({
      req,
      action: "update",
      entity: "salary-config",
      entityId: "settings",
      entityDescription: "Application settings updated",
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const seedSettings = async (req, res, next) => {
  try {
    await AppSetting.bulkWrite(
      Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
        updateOne: {
          filter: { key },
          update: { $setOnInsert: { key, value } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    return getSettings(req, res, next);
  } catch (error) {
    return next(error);
  }
};
