import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import {
  createInvoiceFromJobCard,
  getInvoice,
  listInvoices,
  updateInvoice,
} from "../controllers/invoiceController.js";

const router = express.Router();

router.get("/", requireAuth, listInvoices);
router.get("/:id", requireAuth, getInvoice);
router.post("/from-job/:jobCardId", requireAuth, createInvoiceFromJobCard);
router.patch("/:id", requireAuth, updateInvoice);

export default router;
