import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  approveLeave,
  createLeave,
  listLeaves,
  rejectLeave,
} from "../controllers/leaveController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listLeaves);
router.post("/", requireAuth, requireOwner, createLeave);
router.patch("/:id/approve", requireAuth, requireOwner, approveLeave);
router.patch("/:id/reject", requireAuth, requireOwner, rejectLeave);

export default router;
