import mongoose from "mongoose";
import Customer from "../models/Customer.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const listCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    return res.json(customers);
  } catch (error) {
    return next(error);
  }
};

export const createCustomer = async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    const customer = await Customer.create({
      name,
      phone,
      email,
    });
    return res.status(201).json(customer);
  } catch (error) {
    return next(error);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await Customer.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json(customer);
  } catch (error) {
    return next(error);
  }
};

export const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await Customer.findByIdAndDelete(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({ message: "Customer deleted" });
  } catch (error) {
    return next(error);
  }
};
