import { computeItemTotal, toNumber } from "../../utils/billing.js";

function InvoiceItemRow({ item, onChange, onRemove }) {
  const handleChange = (field, value) => {
    const next = {
      ...item,
      [field]: value,
    };
    next.total = computeItemTotal(next.qty, next.unitPrice);
    onChange(next);
  };

  return (
    <div>
      <input
        value={item.name}
        onChange={(event) => handleChange("name", event.target.value)}
        placeholder="Item name"
        required
      />
      <input
        value={item.brand || ""}
        onChange={(event) => handleChange("brand", event.target.value)}
        placeholder="Brand"
        disabled={item.type !== "PART"}
      />
      <input
        value={item.variant || ""}
        onChange={(event) => handleChange("variant", event.target.value)}
        placeholder="Variant"
        disabled={item.type !== "PART"}
      />
      <select
        value={item.type}
        onChange={(event) => handleChange("type", event.target.value)}
      >
        <option value="SERVICE">SERVICE</option>
        <option value="PART">PART</option>
      </select>
      <input
        type="number"
        min="1"
        value={item.qty}
        onChange={(event) => handleChange("qty", toNumber(event.target.value))}
        required
      />
      <input
        type="number"
        min="0"
        step="0.01"
        value={item.unitPrice}
        onChange={(event) =>
          handleChange("unitPrice", toNumber(event.target.value))
        }
        required
      />
      <span>Total: {item.total}</span>
      <button type="button" onClick={() => onRemove(item.id)}>
        Remove
      </button>
    </div>
  );
}

export default InvoiceItemRow;
