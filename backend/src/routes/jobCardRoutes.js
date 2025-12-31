import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import {
  createJobCard,
  closeJobCard,
  listJobCards,
  updateJobCard,
} from "../controllers/jobCardController.js";

const router = express.Router();

router.get("/", requireAuth, listJobCards);
router.post("/", requireAuth, createJobCard);
router.patch("/:id", requireAuth, updateJobCard);
router.post("/:id/close", requireAuth, closeJobCard);

export default router;
