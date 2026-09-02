import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  getWorkCalendarByMonth,
  listWorkCalendars,
  upsertWorkCalendar,
} from "../controllers/workCalendarController.js";

const router = express.Router();

router.get("/", requireAuth, listWorkCalendars);
router.get("/:month", requireAuth, getWorkCalendarByMonth);
router.put("/:month", requireAuth, requireOwner, upsertWorkCalendar);
router.post("/", requireAuth, requireOwner, upsertWorkCalendar);

export default router;
