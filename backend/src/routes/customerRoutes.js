import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from "../controllers/customerController.js";

const router = express.Router();

router.get("/", requireAuth, listCustomers);
router.post("/", requireAuth, createCustomer);
router.patch("/:id", requireAuth, updateCustomer);
router.delete("/:id", requireAuth, deleteCustomer);

export default router;
