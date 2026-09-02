import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import { listAuditLogs } from "../controllers/auditController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listAuditLogs);

export default router;
