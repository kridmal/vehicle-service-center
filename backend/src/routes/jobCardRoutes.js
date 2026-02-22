import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import {
  addJobCardServiceTypes,
  createJobCard,
  closeJobCard,
  getJobCardById,
  listJobCards,
  updateJobCard,
} from "../controllers/jobCardController.js";

const router = express.Router();

router.get("/", requireAuth, listJobCards);
router.post("/", requireAuth, createJobCard);
router.get("/:id", requireAuth, getJobCardById);
router.put("/:id/service-types", requireAuth, addJobCardServiceTypes);
router.patch("/:id", requireAuth, updateJobCard);
router.post("/:id/close", requireAuth, closeJobCard);

export default router;
