import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createShift,
  deleteShift,
  listShifts,
  updateShift,
} from "../controllers/shiftController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listShifts);
router.post("/", requireAuth, requireOwner, createShift);
router.put("/:id", requireAuth, requireOwner, updateShift);
router.delete("/:id", requireAuth, requireOwner, deleteShift);

export default router;
