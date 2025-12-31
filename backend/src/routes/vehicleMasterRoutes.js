import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createVehicleBrand,
  createVehicleModel,
  deleteVehicleBrand,
  deleteVehicleModel,
  listVehicleBrands,
  listVehicleModels,
  updateVehicleBrand,
  updateVehicleModel,
} from "../controllers/vehicleMasterController.js";

const router = express.Router();

router.get("/brands", requireAuth, listVehicleBrands);
router.post("/brands", requireAuth, requireOwner, createVehicleBrand);
router.patch("/brands/:id", requireAuth, requireOwner, updateVehicleBrand);
router.delete("/brands/:id", requireAuth, requireOwner, deleteVehicleBrand);

router.get("/models", requireAuth, listVehicleModels);
router.post("/models", requireAuth, requireOwner, createVehicleModel);
router.patch("/models/:id", requireAuth, requireOwner, updateVehicleModel);
router.delete("/models/:id", requireAuth, requireOwner, deleteVehicleModel);

export default router;
