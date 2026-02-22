import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  finalizeAttendanceMonth,
  getAttendanceDay,
  getAttendanceFinalizationStatus,
  getAttendanceMonthlyReport,
  listAttendance,
  upsertAttendanceDay,
  upsertAttendance,
} from "../controllers/attendanceController.js";

const router = express.Router();

router.get("/day", requireAuth, requireOwner, getAttendanceDay);
router.post("/day", requireAuth, requireOwner, upsertAttendanceDay);
router.put("/day", requireAuth, requireOwner, upsertAttendanceDay);
router.get("/report/month", requireAuth, requireOwner, getAttendanceMonthlyReport);
router.post("/finalize-month", requireAuth, requireOwner, finalizeAttendanceMonth);
router.get("/finalization-status", requireAuth, requireOwner, getAttendanceFinalizationStatus);
router.get("/", requireAuth, requireOwner, listAttendance);
router.post("/", requireAuth, requireOwner, upsertAttendance);

export default router;
