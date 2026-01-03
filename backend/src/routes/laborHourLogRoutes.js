import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import { listLaborHourLogs } from "../controllers/laborHourLogController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listLaborHourLogs);

export default router;
