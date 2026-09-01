import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  convertPurchaseRequest,
  createPurchaseRequest,
  getPurchaseRequest,
  getPurchaseRequestPdf,
  listPurchaseRequests,
  sendPurchaseRequest,
} from "../controllers/purchaseRequestController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listPurchaseRequests);
router.post("/", requireAuth, requireOwner, createPurchaseRequest);
router.get("/:id", requireAuth, requireOwner, getPurchaseRequest);
router.get("/:id/pdf", requireAuth, requireOwner, getPurchaseRequestPdf);
router.post("/:id/send", requireAuth, requireOwner, sendPurchaseRequest);
router.post("/:id/convert", requireAuth, requireOwner, convertPurchaseRequest);

export default router;
