import mongoose from "mongoose";
import LeaveRequest from "../models/LeaveRequest.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const listLeaveRequests = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.staffId) {
      if (!isValidId(req.query.staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      filter.staffId = req.query.staffId;
    }
    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase();
    }
    const requests = await LeaveRequest.find(filter)
      .populate("leaveTypeId", "name paid")
      .sort({ createdAt: -1 });
    return res.json(requests);
  } catch (error) {
    return next(error);
  }
};

export const createLeaveRequest = async (req, res, next) => {
  try {
    const {
      staffId,
      leaveTypeId,
      startDate,
      endDate,
      days,
      requestedBy,
      notes,
    } = req.body;

    if (!staffId || !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }
    if (!leaveTypeId || !isValidId(leaveTypeId)) {
      return res.status(400).json({ message: "Invalid leave type" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start and end dates required" });
    }

    const request = await LeaveRequest.create({
      staffId,
      leaveTypeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: toNumber(days),
      requestedBy: requestedBy ? String(requestedBy).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
    });

    return res.status(201).json(request);
  } catch (error) {
    return next(error);
  }
};

export const approveLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }
    const updated = await LeaveRequest.findByIdAndUpdate(
      id,
      {
        status: "APPROVED",
        approvedBy: approvedBy ? String(approvedBy).trim() : undefined,
      },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Leave request not found" });
    }
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const rejectLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }
    const updated = await LeaveRequest.findByIdAndUpdate(
      id,
      { status: "REJECTED" },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Leave request not found" });
    }
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};
