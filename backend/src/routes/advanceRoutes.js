import express from "express";
import { requireAuth, requirePayrollAccess } from "../middlewares/authMiddleware.js";
import {
  approveAdvance,
  createAdvance,
  listAdvances,
  payoutAdvance,
  rejectAdvance,
} from "../controllers/advanceController.js";

const router = express.Router();

router.get("/", requireAuth, requirePayrollAccess, listAdvances);
router.post("/", requireAuth, requirePayrollAccess, createAdvance);
router.patch("/:id/approve", requireAuth, requirePayrollAccess, approveAdvance);
router.patch("/:id/reject", requireAuth, requirePayrollAccess, rejectAdvance);
router.patch("/:id/payout", requireAuth, requirePayrollAccess, payoutAdvance);

export default router;
