import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  approvePayroll,
  generatePayroll,
  listPayroll,
  markPayrollPaid,
  unlockPayroll,
  updatePayrollLineItems,
} from "../controllers/payrollController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listPayroll);
router.post("/generate", requireAuth, requireOwner, generatePayroll);
router.put("/:id/line-items", requireAuth, requireOwner, updatePayrollLineItems);
router.put("/:id/approve", requireAuth, requireOwner, approvePayroll);
router.put("/:id/mark-paid", requireAuth, requireOwner, markPayrollPaid);
router.put("/:id/unlock", requireAuth, requireOwner, unlockPayroll);

export default router;
