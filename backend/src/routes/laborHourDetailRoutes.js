import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import { listLaborHourDetails } from "../controllers/laborHourDetailController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listLaborHourDetails);

export default router;
