import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createStaff,
  deleteStaff,
  listStaff,
  updateStaff,
} from "../controllers/staffController.js";

const router = express.Router();

router.get("/", requireAuth, listStaff);
router.post("/", requireAuth, requireOwner, createStaff);
router.patch("/:id", requireAuth, requireOwner, updateStaff);
router.delete("/:id", requireAuth, requireOwner, deleteStaff);

export default router;
