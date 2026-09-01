import express from "express";
import { requireAuth, requirePayrollAccess } from "../middlewares/authMiddleware.js";
import {
  approvePayroll,
  generatePayroll,
  listPayroll,
  markPayrollPaid,
  previewOT,
  unlockPayroll,
  updatePayrollLineItems,
} from "../controllers/payrollController.js";

const router = express.Router();

router.get("/", requireAuth, requirePayrollAccess, listPayroll);
router.get("/ot-preview", requireAuth, requirePayrollAccess, previewOT);
router.post("/generate", requireAuth, requirePayrollAccess, generatePayroll);
router.put("/:id/line-items", requireAuth, requirePayrollAccess, updatePayrollLineItems);
router.put("/:id/approve", requireAuth, requirePayrollAccess, approvePayroll);
router.put("/:id/mark-paid", requireAuth, requirePayrollAccess, markPayrollPaid);
router.put("/:id/unlock", requireAuth, requirePayrollAccess, unlockPayroll);

export default router;
