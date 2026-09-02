import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import DealerSelector from "./DealerSelector.jsx";
import "./Purchases.css";

const emptyItem = () => ({ itemName: "", itemDescription: "", partNumber: "", quantity: "" });

function PurchaseRequestCreate() {
  const navigate = useNavigate();
  const [selectedDealerId, setSelectedDealerId] = useState("");
  const [requestDate, setRequestDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [items, setItems] = useState([emptyItem()]);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (index) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!selectedDealerId) {
      setError("Please select a dealer.");
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].itemName.trim()) {
        setError(`Item ${i + 1}: item name is required.`);
        return;
      }
      const qty = Number(items[i].quantity);
      if (!qty || qty <= 0) {
        setError(`Item ${i + 1}: quantity must be greater than 0.`);
        return;
      }
    }
    const payload = {
      dealerId: selectedDealerId,
      requestDate,
      items: items.map((row) => ({
        itemName: row.itemName.trim(),
        itemDescription: row.itemDescription.trim(),
        partNumber: row.partNumber.trim(),
        quantity: Number(row.quantity),
      })),
      notes: notes.trim(),
    };
    setIsSaving(true);
    try {
      const { data } = await api.post("/purchase-requests", payload);
      navigate(`/purchase-requests/${data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="purchases-page">
      <PageHeader title="New Purchase Request" />

      {error ? <p className="purchases-alert purchases-alert--error">{error}</p> : null}

      <form onSubmit={handleSubmit} className="purchases-card">
        <DealerSelector onDealerChange={(id) => setSelectedDealerId(id)} />

        <div className="purchases-grid" style={{ marginTop: 8 }}>
          <div className="purchases-field">
            <label htmlFor="pr-date">Request Date</label>
            <input
              id="pr-date"
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="purchases-head" style={{ marginTop: 8 }}>
          <div>
            <h2>Items</h2>
            <p>List the parts or items you want to request from the dealer.</p>
          </div>
        </div>

        {items.map((row, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 2fr 1fr 80px auto",
              gap: 10,
              alignItems: "end",
              marginBottom: 8,
            }}
          >
            <div className="purchases-field">
              {idx === 0 ? <label>Item Name *</label> : null}
              <input
                type="text"
                placeholder="Item name"
                value={row.itemName}
                onChange={(e) => updateItem(idx, "itemName", e.target.value)}
                required
              />
            </div>
            <div className="purchases-field">
              {idx === 0 ? <label>Description</label> : null}
              <input
                type="text"
                placeholder="Optional description"
                value={row.itemDescription}
                onChange={(e) => updateItem(idx, "itemDescription", e.target.value)}
              />
            </div>
            <div className="purchases-field">
              {idx === 0 ? <label>Part No.</label> : null}
              <input
                type="text"
                placeholder="Optional"
                value={row.partNumber}
                onChange={(e) => updateItem(idx, "partNumber", e.target.value)}
              />
            </div>
            <div className="purchases-field">
              {idx === 0 ? <label>Qty *</label> : null}
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder="0"
                value={row.quantity}
                onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                required
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 0 }}>
              {items.length > 1 ? (
                <button
                  type="button"
                  className="purchases-button-danger"
                  onClick={() => removeItem(idx)}
                >
                  ✕
                </button>
              ) : (
                <div style={{ width: 38 }} />
              )}
            </div>
          </div>
        ))}

        <div>
          <button type="button" className="purchases-button-ghost" onClick={addItem}>
            + Add Item
          </button>
        </div>

        <div className="purchases-field" style={{ marginTop: 8 }}>
          <label htmlFor="pr-notes">Notes (optional)</label>
          <textarea
            id="pr-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes for the dealer..."
          />
        </div>

        <div className="purchases-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="purchases-button-ghost"
            onClick={() => navigate("/purchase-requests")}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button type="submit" className="purchases-button" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save as Draft"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PurchaseRequestCreate;
