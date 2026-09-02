import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  adjustLeaveBalance,
  approveLeaveRequest,
  createLeaveRequest,
  listLeaveBalances,
  listLeaveRequests,
  rejectLeaveRequest,
} from "../controllers/leaveRequestController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listLeaveRequests);
router.get("/balances", requireAuth, requireOwner, listLeaveBalances);
router.patch("/balances/:id", requireAuth, requireOwner, adjustLeaveBalance);
router.post("/", requireAuth, requireOwner, createLeaveRequest);
router.put("/:id/approve", requireAuth, requireOwner, approveLeaveRequest);
router.put("/:id/reject", requireAuth, requireOwner, rejectLeaveRequest);

export default router;
