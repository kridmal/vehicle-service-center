import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createWorker,
  deleteWorker,
  listWorkers,
  updateWorker,
} from "../controllers/workerController.js";

const router = express.Router();

router.get("/", requireAuth, listWorkers);
router.post("/", requireAuth, requireOwner, createWorker);
router.patch("/:id", requireAuth, requireOwner, updateWorker);
router.delete("/:id", requireAuth, requireOwner, deleteWorker);

export default router;
