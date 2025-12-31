import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createPayslip,
  listPayslips,
  markPayslipPaid,
} from "../controllers/payslipController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listPayslips);
router.post("/", requireAuth, requireOwner, createPayslip);
router.put("/:id/mark-paid", requireAuth, requireOwner, markPayslipPaid);

export default router;
