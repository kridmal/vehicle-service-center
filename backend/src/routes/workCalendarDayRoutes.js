import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  generateWorkCalendarMonth,
  getWorkCalendarDaysByMonth,
  updateWorkCalendarDay,
} from "../controllers/workCalendarController.js";

const router = express.Router();

router.post("/generate", requireAuth, requireOwner, generateWorkCalendarMonth);
router.get("/", requireAuth, getWorkCalendarDaysByMonth);
router.put("/day", requireAuth, requireOwner, updateWorkCalendarDay);

export default router;
