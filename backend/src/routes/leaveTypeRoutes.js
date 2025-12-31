import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createLeaveType,
  deleteLeaveType,
  listLeaveTypes,
  updateLeaveType,
} from "../controllers/leaveTypeController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listLeaveTypes);
router.post("/", requireAuth, requireOwner, createLeaveType);
router.put("/:id", requireAuth, requireOwner, updateLeaveType);
router.delete("/:id", requireAuth, requireOwner, deleteLeaveType);

export default router;
