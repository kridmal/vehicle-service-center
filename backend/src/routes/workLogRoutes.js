import express from "express";
import { requireAuth, requirePayrollAccess } from "../middlewares/authMiddleware.js";
import { listWorkLogs } from "../controllers/workLogController.js";

const router = express.Router();

router.get("/", requireAuth, requirePayrollAccess, listWorkLogs);

export default router;

