import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import DealerSelector from "./DealerSelector.jsx";
import "./Purchases.css";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const todayIso = new Date().toISOString().slice(0, 10);

function PurchaseCreate() {
  const navigate = useNavigate();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedDealerId, setSelectedDealerId] = useState("");

  const [dealerInvoiceNumber, setDealerInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso);
  const [purchaseType, setPurchaseType] = useState("CREDIT");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const [itemSearch, setItemSearch] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [itemQty, setItemQty] = useState("");
  const [unitCostPrice, setUnitCostPrice] = useState("");
  const [lineItems, setLineItems] = useState([]);

  const [invoiceDiscountType, setInvoiceDiscountType] = useState("AMOUNT");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState("0");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [paidNow, setPaidNow] = useState("0");

  const loadInventory = useCallback(async () => {
    const { data } = await api.get("/inventory");
    setInventoryItems(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      setError("");
      try {
        await loadInventory();
      } catch (requestError) {
        if (
          requestError.response?.status === 401 ||
          requestError.response?.status === 403
        ) {
          navigate("/login", { replace: true });
          return;
        }
        setError(
          requestError.response?.data?.message ||
            "Unable to load inventory right now."
        );
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, [loadInventory, navigate]);

  const selectedInventory = useMemo(
    () =>
      inventoryItems.find((item) => String(item._id) === String(selectedInventoryId)) ||
      null,
    [inventoryItems, selectedInventoryId]
  );

  const filteredInventory = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return inventoryItems;
    return inventoryItems.filter((item) =>
      [item.itemName, item.sku, item.brand, item.variant]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    );
  }, [inventoryItems, itemSearch]);

  const subtotal = useMemo(
    () =>
      lineItems.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0),
    [lineItems]
  );

  const invoiceDiscountAmount = useMemo(() => {
    const raw = Math.max(0, Number(invoiceDiscountValue) || 0);
    if (invoiceDiscountType === "PERCENT") {
      return Math.min(subtotal, (subtotal * Math.min(raw, 100)) / 100);
    }
    return Math.min(subtotal, raw);
  }, [invoiceDiscountType, invoiceDiscountValue, subtotal]);

  const taxableAmount = Math.max(0, subtotal - invoiceDiscountAmount);
  const taxAmount = taxEnabled
    ? (taxableAmount * Math.max(0, Number(taxRate) || 0)) / 100
    : 0;
  const totalAmount = taxableAmount + taxAmount;
  const paidNowValue = Math.max(0, Number(paidNow) || 0);
  const balanceAmount = Math.max(0, totalAmount - Math.min(totalAmount, paidNowValue));

  const addLineItem = () => {
    if (!selectedInventory) return;
    const qty = Math.max(0, Number(itemQty) || 0);
    const cost = Math.max(0, Number(unitCostPrice) || 0);
    if (qty <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    setError("");
    setLineItems((prev) => {
      const index = prev.findIndex(
        (line) =>
          String(line.inventoryItemId) === String(selectedInventory._id) &&
          Number(line.unitCostPrice) === cost
      );
      if (index === -1) {
        return [
          ...prev,
          {
            inventoryItemId: selectedInventory._id,
            itemName: selectedInventory.itemName || selectedInventory.name,
            sku: selectedInventory.sku || "",
            qty,
            unitCostPrice: cost,
            lineTotal: qty * cost,
          },
        ];
      }
      return prev.map((line, rowIndex) =>
        rowIndex === index
          ? {
              ...line,
              qty: line.qty + qty,
              lineTotal: (line.qty + qty) * cost,
            }
          : line
      );
    });
    setSelectedInventoryId("");
    setItemSearch("");
    setItemQty("");
    setUnitCostPrice("");
  };

  const removeLineItem = (index) => {
    setLineItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedDealerId) {
      setError("Select a dealer before saving.");
      return;
    }
    if (!dealerInvoiceNumber.trim()) {
      setError("Dealer invoice number is required.");
      return;
    }
    if (lineItems.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    if (paidNowValue > totalAmount) {
      setError("Paid now amount cannot exceed total amount.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/purchases", {
        dealerId: selectedDealerId,
        dealerInvoiceNumber: dealerInvoiceNumber.trim(),
        purchaseDate,
        purchaseType,
        items: lineItems.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          qty: line.qty,
          unitCostPrice: line.unitCostPrice,
        })),
        invoiceDiscount: {
          type: invoiceDiscountType,
          value: Math.max(0, Number(invoiceDiscountValue) || 0),
        },
        tax: {
          enabled: taxEnabled,
          rate: Math.max(0, Number(taxRate) || 0),
        },
        paidNow: paidNowValue,
        nextVisitDate: nextVisitDate || null,
        remarks: remarks.trim(),
      });

      const purchaseId = data?._id || data?.id;
      if (purchaseId) {
        navigate(`/purchases/${purchaseId}`);
        return;
      }
      setNotice("Purchase invoice created successfully.");
    } catch (requestError) {
      if (
        requestError.response?.status === 401 ||
        requestError.response?.status === 403
      ) {
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError.response?.data?.message ||
          "Unable to create purchase invoice right now."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="purchases-page">
      <PageHeader title="New Purchase Invoice" />

      {error ? <p className="purchases-alert purchases-alert--error">{error}</p> : null}
      {notice ? <p className="purchases-alert purchases-alert--success">{notice}</p> : null}

      <form onSubmit={handleSubmit} className="purchases-card">
        <DealerSelector onDealerChange={(id) => setSelectedDealerId(id)} />

        <div className="purchases-grid">
          <div className="purchases-field">
            <label htmlFor="dealer-invoice-no">Dealer Invoice Number</label>
            <input
              id="dealer-invoice-no"
              value={dealerInvoiceNumber}
              onChange={(event) => setDealerInvoiceNumber(event.target.value)}
              required
            />
          </div>
          <div className="purchases-field">
            <label htmlFor="purchase-date">Purchase Date</label>
            <input
              id="purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
              required
            />
          </div>
        </div>

        <div className="purchases-grid">
          <div className="purchases-field">
            <label htmlFor="purchase-type">Purchase Type</label>
            <select
              id="purchase-type"
              value={purchaseType}
              onChange={(event) => setPurchaseType(event.target.value)}
            >
              <option value="CREDIT">CREDIT</option>
              <option value="CHEQUE">CHEQUE</option>
              <option value="CASH">CASH</option>
            </select>
          </div>
          <div className="purchases-field">
            <label htmlFor="next-visit-date">Next Visit Date (optional)</label>
            <input
              id="next-visit-date"
              type="date"
              value={nextVisitDate}
              onChange={(event) => setNextVisitDate(event.target.value)}
            />
          </div>
        </div>

        <div className="purchases-field">
          <label htmlFor="purchase-remarks">Remarks (optional)</label>
          <textarea
            id="purchase-remarks"
            rows={2}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </div>

        <div className="purchases-head">
          <div>
            <h2>Line Items</h2>
            <p>Add inventory items with purchase quantity and unit cost.</p>
          </div>
        </div>

        <div className="purchases-inline">
          <div className="purchases-field">
            <label htmlFor="purchase-item-search">Inventory Item</label>
            <input
              id="purchase-item-search"
              type="search"
              list="purchase-item-options"
              value={itemSearch}
              onChange={(event) => {
                const value = event.target.value;
                setItemSearch(value);
                const query = value.trim().toLowerCase();
                const match =
                  inventoryItems.find(
                    (item) =>
                      item.itemName?.toLowerCase() === query ||
                      item.sku?.toLowerCase() === query
                  ) || null;
                setSelectedInventoryId(match ? match._id : "");
              }}
              placeholder="Search by name or SKU"
            />
            <datalist id="purchase-item-options">
              {filteredInventory.map((item) => (
                <option
                  key={item._id}
                  value={item.itemName || item.name}
                >{`${item.sku} | ${item.itemName || item.name}`}</option>
              ))}
              {filteredInventory.map((item) => (
                <option key={`${item._id}-sku`} value={item.sku} />
              ))}
            </datalist>
          </div>
          <div className="purchases-field">
            <label htmlFor="purchase-item-qty">Qty</label>
            <input
              id="purchase-item-qty"
              type="number"
              min="0"
              value={itemQty}
              onChange={(event) => setItemQty(event.target.value)}
            />
          </div>
          <div className="purchases-field">
            <label htmlFor="purchase-item-cost">Unit Cost (LKR)</label>
            <input
              id="purchase-item-cost"
              type="number"
              min="0"
              value={unitCostPrice}
              onChange={(event) => setUnitCostPrice(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="purchases-button"
            onClick={addLineItem}
            disabled={!selectedInventoryId || !itemQty}
          >
            Add
          </button>
        </div>

        {lineItems.length === 0 ? (
          <p className="purchases-empty">No line items added yet.</p>
        ) : (
          <div className="purchases-table">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th className="purchases-right">Qty</th>
                  <th className="purchases-right">Unit Cost</th>
                  <th className="purchases-right">Line Total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((line, index) => (
                  <tr key={`${line.inventoryItemId}-${line.unitCostPrice}-${index}`}>
                    <td>{line.itemName}</td>
                    <td>{line.sku || "-"}</td>
                    <td className="purchases-right">{line.qty}</td>
                    <td className="purchases-right">{formatCurrency(line.unitCostPrice)}</td>
                    <td className="purchases-right">{formatCurrency(line.lineTotal)}</td>
                    <td>
                      <button
                        type="button"
                        className="purchases-button-danger"
                        onClick={() => removeLineItem(index)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="purchases-grid">
          <div className="purchases-field">
            <label htmlFor="invoice-discount-type">Invoice Discount Type</label>
            <select
              id="invoice-discount-type"
              value={invoiceDiscountType}
              onChange={(event) => setInvoiceDiscountType(event.target.value)}
            >
              <option value="AMOUNT">Amount</option>
              <option value="PERCENT">Percent</option>
            </select>
          </div>
          <div className="purchases-field">
            <label htmlFor="invoice-discount-value">
              Invoice Discount ({invoiceDiscountType === "PERCENT" ? "%" : "LKR"})
            </label>
            <input
              id="invoice-discount-value"
              type="number"
              min="0"
              value={invoiceDiscountValue}
              onChange={(event) => setInvoiceDiscountValue(event.target.value)}
            />
          </div>
        </div>

        <div className="purchases-grid">
          <div className="purchases-field">
            <label htmlFor="tax-enabled">Apply Tax</label>
            <select
              id="tax-enabled"
              value={taxEnabled ? "YES" : "NO"}
              onChange={(event) => setTaxEnabled(event.target.value === "YES")}
            >
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
          </div>
          <div className="purchases-field">
            <label htmlFor="tax-rate">Tax Rate (%)</label>
            <input
              id="tax-rate"
              type="number"
              min="0"
              max="100"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
              disabled={!taxEnabled}
            />
          </div>
        </div>

        <div className="purchases-grid">
          <div className="purchases-field">
            <label htmlFor="paid-now">Paid Now (optional)</label>
            <input
              id="paid-now"
              type="number"
              min="0"
              value={paidNow}
              onChange={(event) => setPaidNow(event.target.value)}
            />
          </div>
        </div>

        <div className="purchases-summary">
          <div>
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <div>
            <span>Invoice Discount</span>
            <strong>-{formatCurrency(invoiceDiscountAmount)}</strong>
          </div>
          <div>
            <span>Tax</span>
            <strong>{formatCurrency(taxAmount)}</strong>
          </div>
          <div className="is-grand">
            <span>Total</span>
            <strong>{formatCurrency(totalAmount)}</strong>
          </div>
          <div>
            <span>Paid Now</span>
            <strong>{formatCurrency(Math.min(totalAmount, paidNowValue))}</strong>
          </div>
          <div>
            <span>Balance</span>
            <strong>{formatCurrency(balanceAmount)}</strong>
          </div>
        </div>

        <div className="purchases-actions">
          <button
            type="button"
            className="purchases-button-ghost"
            onClick={() => navigate("/purchases")}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="purchases-button"
            disabled={isSaving || isLoading}
          >
            Save Purchase Invoice
          </button>
        </div>
      </form>
    </div>
  );
}

export default PurchaseCreate;

