import express from "express";
import {
  requireAuth,
  requireOwner,
  requireOwnerOrOperator,
} from "../middlewares/authMiddleware.js";
import {
  listAttendance,
  upsertAttendance,
} from "../controllers/attendanceController.js";
import {
  checkMonthlyAttendance,
  confirmMonthlyAttendance,
} from "../controllers/monthlySummaryController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listAttendance);
router.post("/", requireAuth, requireOwner, upsertAttendance);
router.post(
  "/monthly/:id/check",
  requireAuth,
  requireOwnerOrOperator,
  checkMonthlyAttendance
);
router.post(
  "/monthly/:id/confirm",
  requireAuth,
  requireOwner,
  confirmMonthlyAttendance
);

export default router;
