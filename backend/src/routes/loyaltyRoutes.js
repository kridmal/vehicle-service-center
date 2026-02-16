import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  listLoyaltyRules,
  createLoyaltyRule,
  updateLoyaltyRule,
  deleteLoyaltyRule,
  getCustomerLoyalty,
  previewJobCardRewards,
  checkEligibleRewards,
  redeemReward,
  recalculateLoyalty,
} from "../controllers/loyaltyController.js";

const router = express.Router();

// Rules CRUD
router.get("/rules", requireAuth, listLoyaltyRules);
router.post("/rules", requireAuth, requireOwner, createLoyaltyRule);
router.put("/rules/:id", requireAuth, requireOwner, updateLoyaltyRule);
router.delete("/rules/:id", requireAuth, requireOwner, deleteLoyaltyRule);

// Customer loyalty
router.get("/customer/:customerId", requireAuth, getCustomerLoyalty);
router.get(
  "/customer/:customerId/job-card-preview",
  requireAuth,
  previewJobCardRewards
);
router.get("/customer/:customerId/eligible", requireAuth, checkEligibleRewards);
router.get("/check-rewards/:customerId", requireAuth, checkEligibleRewards);
router.post("/customer/:customerId/redeem", requireAuth, redeemReward);
router.post("/customer/:customerId/recalculate", requireAuth, recalculateLoyalty);

export default router;
