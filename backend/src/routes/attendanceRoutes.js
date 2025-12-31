import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  listAttendance,
  upsertAttendance,
} from "../controllers/attendanceController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listAttendance);
router.post("/", requireAuth, requireOwner, upsertAttendance);

export default router;
