import express from "express";
import { requireAuth, requireSalesAccess } from "../middlewares/authMiddleware.js";
import {
  createSale,
  getSaleById,
  listSaleProducts,
  listSales,
} from "../controllers/salesController.js";

const router = express.Router();

router.get("/products", requireAuth, requireSalesAccess, listSaleProducts);
router.post("/", requireAuth, requireSalesAccess, createSale);
router.get("/", requireAuth, requireSalesAccess, listSales);
router.get("/:id", requireAuth, requireSalesAccess, getSaleById);

export default router;
