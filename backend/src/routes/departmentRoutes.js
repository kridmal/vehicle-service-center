import express from "express";
import { requireAuth, requireOwner } from "../middlewares/authMiddleware.js";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from "../controllers/departmentController.js";

const router = express.Router();

router.get("/", requireAuth, requireOwner, listDepartments);
router.post("/", requireAuth, requireOwner, createDepartment);
router.put("/:id", requireAuth, requireOwner, updateDepartment);
router.delete("/:id", requireAuth, requireOwner, deleteDepartment);

export default router;
