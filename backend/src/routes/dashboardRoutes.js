import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { getDashboardSummary } from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/summary", requireAuth, getDashboardSummary);

export default router;
