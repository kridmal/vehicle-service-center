import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createRole,
  listRoles,
  seedRoles,
  updateRole,
} from "../controllers/roleController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listRoles);
router.post("/seed", requireAuth, requireOwner, seedRoles);
router.post("/", requireAuth, requireOwner, createRole);
router.put("/:id", requireAuth, requireOwner, updateRole);

export default router;
