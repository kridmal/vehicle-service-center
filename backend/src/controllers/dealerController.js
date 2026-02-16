import mongoose from "mongoose";
import Counter from "../models/Counter.js";
import Dealer from "../models/Dealer.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeDealerCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextDealerCode = async () => {
  const counter = await Counter.findByIdAndUpdate(
    "dealerCode",
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
  return `DLR-${String(counter.seq).padStart(4, "0")}`;
};

export const createDealer = async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Dealer name is required" });
    }

    const explicitCode = normalizeDealerCode(req.body?.dealerCode);
    const dealerCode = explicitCode || (await nextDealerCode());
    const existingCode = await Dealer.findOne({ dealerCode });
    if (existingCode) {
      return res.status(409).json({ message: "Dealer code already exists" });
    }

    const dealer = await Dealer.create({
      dealerCode,
      name,
      address: String(req.body?.address || "").trim(),
      phone1: String(req.body?.phone1 || "").trim(),
      phone2: String(req.body?.phone2 || "").trim(),
      email: String(req.body?.email || "").trim(),
      notes: String(req.body?.notes || "").trim(),
    });

    return res.status(201).json(dealer);
  } catch (error) {
    return next(error);
  }
};

export const listDealers = async (req, res, next) => {
  try {
    const search = String(
      req.query?.q || req.query?.search || req.query?.dealerCode || req.query?.name || ""
    ).trim();
    const query = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { dealerCode: { $regex: safeSearch, $options: "i" } },
        { name: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const dealers = await Dealer.find(query).sort({ name: 1, dealerCode: 1 }).limit(200);
    return res.json(dealers);
  } catch (error) {
    return next(error);
  }
};

export const getDealerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid dealer id" });
    }
    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }
    return res.json(dealer);
  } catch (error) {
    return next(error);
  }
};

export const updateDealer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid dealer id" });
    }

    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    const nextName = String(req.body?.name ?? dealer.name).trim();
    if (!nextName) {
      return res.status(400).json({ message: "Dealer name is required" });
    }

    if (req.body?.dealerCode !== undefined) {
      const nextCode = normalizeDealerCode(req.body?.dealerCode);
      if (!nextCode) {
        return res.status(400).json({ message: "Dealer code is invalid" });
      }
      const existingCode = await Dealer.findOne({
        dealerCode: nextCode,
        _id: { $ne: dealer._id },
      });
      if (existingCode) {
        return res.status(409).json({ message: "Dealer code already exists" });
      }
      dealer.dealerCode = nextCode;
    }

    dealer.name = nextName;
    if (req.body?.address !== undefined) {
      dealer.address = String(req.body.address || "").trim();
    }
    if (req.body?.phone1 !== undefined) {
      dealer.phone1 = String(req.body.phone1 || "").trim();
    }
    if (req.body?.phone2 !== undefined) {
      dealer.phone2 = String(req.body.phone2 || "").trim();
    }
    if (req.body?.email !== undefined) {
      dealer.email = String(req.body.email || "").trim();
    }
    if (req.body?.notes !== undefined) {
      dealer.notes = String(req.body.notes || "").trim();
    }

    const saved = await dealer.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

