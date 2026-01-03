import express from "express";
import {
  finalizePayrollRun,
  listPayrollRuns,
  upsertPayrollRun,
} from "../controllers/payrollRunController.js";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listPayrollRuns);
router.post("/", requireAuth, requireOwner, upsertPayrollRun);
router.put("/:id/finalize", requireAuth, requireOwner, finalizePayrollRun);

export default router;
