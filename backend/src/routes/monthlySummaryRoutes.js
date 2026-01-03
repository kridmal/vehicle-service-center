import express from "express";
import {
  requireAuth,
  requireOwnerOrAdmin,
} from "../middlewares/authMiddleware.js";
import {
  confirmMonthlyAttendance,
  listMonthlySummaries,
  loadMonthlySummaryData,
  updateMonthlySummaryStatus,
} from "../controllers/monthlySummaryController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwnerOrAdmin, listMonthlySummaries);
router.post("/load", requireAuth, requireOwnerOrAdmin, loadMonthlySummaryData);
router.patch(
  "/:id/confirm-attendance",
  requireAuth,
  requireOwnerOrAdmin,
  confirmMonthlyAttendance
);
router.patch(
  "/:id/status",
  requireAuth,
  requireOwnerOrAdmin,
  updateMonthlySummaryStatus
);

export default router;
