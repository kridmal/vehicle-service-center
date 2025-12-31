import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  approveLeaveRequest,
  createLeaveRequest,
  listLeaveRequests,
  rejectLeaveRequest,
} from "../controllers/leaveRequestController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listLeaveRequests);
router.post("/", requireAuth, requireOwner, createLeaveRequest);
router.put("/:id/approve", requireAuth, requireOwner, approveLeaveRequest);
router.put("/:id/reject", requireAuth, requireOwner, rejectLeaveRequest);

export default router;
