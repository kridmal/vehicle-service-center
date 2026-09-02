import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  getSalaryConfig,
  upsertSalaryConfig,
} from "../controllers/salaryConfigController.js";

const router = express.Router();

router.get("/:employeeId", requireAuth, requireOwner, getSalaryConfig);
router.put("/:employeeId", requireAuth, requireOwner, upsertSalaryConfig);

export default router;
