import express from "express";
import {
  getWorkCalendar,
  lockWorkCalendar,
  upsertWorkCalendar,
} from "../controllers/workCalendarController.js";
import { requireAuth, requireOwnerOrAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", requireAuth, requireOwnerOrAdmin, getWorkCalendar);
router.post("/", requireAuth, requireOwnerOrAdmin, upsertWorkCalendar);
router.patch("/:id/lock", requireAuth, requireOwnerOrAdmin, lockWorkCalendar);

export default router;
