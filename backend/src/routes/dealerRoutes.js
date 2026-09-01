import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createDealer,
  getDealerById,
  getDealerPendingSummary,
  listDealers,
  payDealerBalance,
  updateDealer,
} from "../controllers/dealerController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listDealers);
router.post("/", requireAuth, requireOwner, createDealer);
router.get("/:id/pending-summary", requireAuth, requireOwner, getDealerPendingSummary);
router.post("/:id/pay", requireAuth, requireOwner, payDealerBalance);
router.get("/:id", requireAuth, requireOwner, getDealerById);
router.put("/:id", requireAuth, requireOwner, updateDealer);

export default router;

