import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  getSettings,
  seedSettings,
  upsertSettings,
} from "../controllers/settingsController.js";

const router = express.Router();

router.get("/", requireAuth, getSettings);
router.post("/seed", requireAuth, requireOwner, seedSettings);
router.put("/", requireAuth, requireOwner, upsertSettings);

export default router;
