import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  addPurchasePayment,
  createPurchaseInvoice,
  getPurchaseInvoice,
  listPurchaseInvoices,
  listPurchasePayments,
} from "../controllers/purchaseController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listPurchaseInvoices);
router.post("/", requireAuth, requireOwner, createPurchaseInvoice);
router.get("/:id", requireAuth, requireOwner, getPurchaseInvoice);
router.get("/:id/payments", requireAuth, requireOwner, listPurchasePayments);
router.post("/:id/payments", requireAuth, requireOwner, addPurchasePayment);

export default router;

