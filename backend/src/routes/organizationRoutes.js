import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  listDepartments,
  listShifts,
  seedDepartments,
  seedShifts,
} from "../controllers/organizationController.js";

const router = express.Router();

router.get("/departments", requireAuth, listDepartments);
router.post("/departments/seed", requireAuth, requireOwner, seedDepartments);
router.get("/shifts", requireAuth, listShifts);
router.post("/shifts/seed", requireAuth, requireOwner, seedShifts);

export default router;
