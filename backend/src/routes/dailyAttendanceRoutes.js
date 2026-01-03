import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  listDailyAttendance,
  upsertDailyAttendance,
} from "../controllers/dailyAttendanceController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listDailyAttendance);
router.post("/", requireAuth, requireOwner, upsertDailyAttendance);

export default router;
