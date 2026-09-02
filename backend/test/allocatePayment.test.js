import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocatePayment } from "../src/utils/allocatePayment.js";

const makeInvoice = (id, total, paid = 0, date = "2024-01-01") => ({
  _id: id,
  totalAmount: total,
  paidAmount: paid,
  balanceAmount: total - paid,
  status: paid <= 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTIALLY_PAID",
  purchaseDate: date,
});

describe("allocatePayment", () => {
  it("exact match — pays all invoices with zero leftover", () => {
    const invoices = [
      makeInvoice("a", 1000, 0, "2024-01-01"),
      makeInvoice("b", 500, 0, "2024-01-02"),
    ];
    const { updatedInvoices, unallocated } = allocatePayment(invoices, 1500);

    assert.equal(unallocated, 0);
    assert.equal(updatedInvoices[0].status, "PAID");
    assert.equal(updatedInvoices[0].balanceAmount, 0);
    assert.equal(updatedInvoices[1].status, "PAID");
    assert.equal(updatedInvoices[1].balanceAmount, 0);
  });

  it("overpayment — returns unallocated surplus when payment exceeds total pending", () => {
    const invoices = [makeInvoice("a", 1000, 0, "2024-01-01")];
    const { updatedInvoices, unallocated } = allocatePayment(invoices, 1500);

    assert.equal(unallocated, 500);
    assert.equal(updatedInvoices[0].status, "PAID");
    assert.equal(updatedInvoices[0].balanceAmount, 0);
  });

  it("underpayment mid-invoice — FIFO worked example: [1000,2000,1000,2000] paying 2500", () => {
    const invoices = [
      makeInvoice("1", 1000, 0, "2024-01-01"),
      makeInvoice("2", 2000, 0, "2024-01-02"),
      makeInvoice("3", 1000, 0, "2024-01-03"),
      makeInvoice("4", 2000, 0, "2024-01-04"),
    ];
    const { updatedInvoices, unallocated } = allocatePayment(invoices, 2500);

    assert.equal(unallocated, 0);
    assert.equal(updatedInvoices[0].status, "PAID");
    assert.equal(updatedInvoices[0].balanceAmount, 0);
    assert.equal(updatedInvoices[0]._amountApplied, 1000);

    assert.equal(updatedInvoices[1].status, "PARTIALLY_PAID");
    assert.equal(updatedInvoices[1].balanceAmount, 500);
    assert.equal(updatedInvoices[1]._amountApplied, 1500);

    assert.equal(updatedInvoices[2].status, "UNPAID");
    assert.equal(updatedInvoices[2]._amountApplied, 0);

    assert.equal(updatedInvoices[3].status, "UNPAID");
    assert.equal(updatedInvoices[3]._amountApplied, 0);
  });

  it("already-PARTIAL invoice — only outstanding balance is applied", () => {
    const invoices = [
      makeInvoice("a", 2000, 1200, "2024-01-01"),
      makeInvoice("b", 1000, 0, "2024-01-02"),
    ];
    const { updatedInvoices, unallocated } = allocatePayment(invoices, 1000);

    assert.equal(updatedInvoices[0].status, "PAID");
    assert.equal(updatedInvoices[0].balanceAmount, 0);
    assert.equal(updatedInvoices[0]._amountApplied, 800);

    assert.equal(updatedInvoices[1].status, "PARTIALLY_PAID");
    assert.equal(updatedInvoices[1]._amountApplied, 200);
    assert.equal(updatedInvoices[1].balanceAmount, 800);
    assert.equal(unallocated, 0);
  });

  it("zero payment — no invoices touched, unallocated is 0", () => {
    const invoices = [makeInvoice("a", 1000, 0, "2024-01-01")];
    const { updatedInvoices, unallocated } = allocatePayment(invoices, 0);

    assert.equal(unallocated, 0);
    assert.equal(updatedInvoices[0].status, "UNPAID");
    assert.equal(updatedInvoices[0]._amountApplied, 0);
  });

  it("empty invoice list — returns empty array and full amount as unallocated", () => {
    const { updatedInvoices, unallocated } = allocatePayment([], 500);
    assert.equal(updatedInvoices.length, 0);
    assert.equal(unallocated, 500);
  });

  it("sorts by purchaseDate ascending regardless of input order", () => {
    const invoices = [
      makeInvoice("newer", 500, 0, "2024-02-01"),
      makeInvoice("older", 500, 0, "2024-01-01"),
    ];
    const { updatedInvoices } = allocatePayment(invoices, 500);
    const paidOne = updatedInvoices.find((inv) => inv._id === "older");
    const unpaidOne = updatedInvoices.find((inv) => inv._id === "newer");
    assert.equal(paidOne.status, "PAID");
    assert.equal(unpaidOne.status, "UNPAID");
  });
});
