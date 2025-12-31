import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import { getReportsSummary } from "../controllers/reportsController.js";

const router = express.Router();

router.get("/summary", requireAuth, requireOwner, getReportsSummary);

export default router;
