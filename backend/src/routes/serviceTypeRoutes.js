import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createServiceType,
  deleteServiceType,
  listServiceTypes,
  updateServiceType,
} from "../controllers/serviceTypeController.js";

const router = express.Router();

router.get("/", requireAuth, listServiceTypes);
router.post("/", requireAuth, requireOwner, createServiceType);
router.put("/:id", requireAuth, requireOwner, updateServiceType);
router.delete("/:id", requireAuth, requireOwner, deleteServiceType);

export default router;
