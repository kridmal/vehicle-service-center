import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createInventoryCategory,
  deleteInventoryCategory,
  listInventoryCategories,
  updateInventoryCategory,
} from "../controllers/inventoryCategoryController.js";

const router = express.Router();

router.get("/", requireAuth, listInventoryCategories);
router.post("/", requireAuth, requireOwner, createInventoryCategory);
router.put("/:id", requireAuth, requireOwner, updateInventoryCategory);
router.delete("/:id", requireAuth, requireOwner, deleteInventoryCategory);

export default router;
