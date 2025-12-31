import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createInventoryItem,
  deleteInventoryItem,
  listInventory,
  updateInventoryItem,
} from "../controllers/inventoryController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listInventory);
router.post("/", requireAuth, requireOwner, createInventoryItem);
router.patch("/:id", requireAuth, requireOwner, updateInventoryItem);
router.delete("/:id", requireAuth, requireOwner, deleteInventoryItem);

export default router;
