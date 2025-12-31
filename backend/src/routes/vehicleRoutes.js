import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  updateVehicle,
} from "../controllers/vehicleController.js";

const router = express.Router();

router.get("/", requireAuth, listVehicles);
router.post("/", requireAuth, createVehicle);
router.patch("/:id", requireAuth, updateVehicle);
router.delete("/:id", requireAuth, deleteVehicle);

export default router;
