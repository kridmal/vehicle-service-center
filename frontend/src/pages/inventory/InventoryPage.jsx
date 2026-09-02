import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import { computeItemDiscount } from "../../utils/itemDiscount.js";
import "./InventoryPage.css";

function InventoryPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [variant, setVariant] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [minStock, setMinStock] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [isCostFocused, setIsCostFocused] = useState(false);
  const [isSellingFocused, setIsSellingFocused] = useState(false);
  const [sku, setSku] = useState("");
  const [skuEdited, setSkuEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rowActionId, setRowActionId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryActionId, setCategoryActionId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [categoryDraft, setCategoryDraft] = useState({ name: "" });
  const [discountTarget, setDiscountTarget] = useState(null);
  const [discountDraft, setDiscountDraft] = useState({
    discountEnabled: false,
    discountType: "PERCENT",
    discountValue: "",
    discountStartAt: "",
    discountEndAt: "",
    minQtyForDiscount: "1",
    maxDiscountCap: "",
    discountNote: "",
  });
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);
  const [editDraft, setEditDraft] = useState({
    itemName: "",
    category: "",
    brand: "",
    variant: "",
    quantity: "",
    unit: "",
    minStock: "",
    costPrice: "",
    sellingPrice: "",
    sku: "",
  });
  const unitOptions = ["Bottle", "Liter", "Piece"];
  const navigate = useNavigate();
  const { user } = useAuth();
  const isFormValid =
    itemName.trim() &&
    category.trim() &&
    quantity !== "" &&
    unit.trim() &&
    costPrice !== "" &&
    sellingPrice !== "";

  const activeCategories = useMemo(
    () => categories.filter((cat) => cat.active !== false),
    [categories]
  );

  const allCategoryOptions = useMemo(
    () =>
      categories.map((cat) => ({
        id: cat._id || cat.id,
        name: cat.name,
        label: cat.active === false ? `${cat.name} (Inactive)` : cat.name,
      })),
    [categories]
  );

  const normalizeSegment = (value) =>
    String(value ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .trim();

  const shortFromWords = (value, fallback = "") => {
    const words = String(value ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) return fallback;
    return words.map((word) => normalizeSegment(word)[0]).join("");
  };

  const shortFromValue = (value, length, fallback = "") => {
    const normalized = normalizeSegment(value);
    if (!normalized) return fallback;
    return normalized.slice(0, length);
  };

  const sanitizePriceInput = (value) => {
    const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
    const firstDotIndex = cleaned.indexOf(".");
    if (firstDotIndex === -1) return cleaned;
    return (
      cleaned.slice(0, firstDotIndex + 1) +
      cleaned.slice(firstDotIndex + 1).replace(/\./g, "")
    );
  };

  const normalizePriceValue = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "";
    return parsed.toFixed(2);
  };

  const formatLkr = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "";
    return `Rs. ${parsed.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatMoney = (value) =>
    `Rs. ${(Number(value) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const toDateInputValue = (value) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
  };

  const formatDiscountLabel = (item) => {
    if (!item?.discountEnabled) return "-";
    const type = String(item.discountType || "")
      .trim()
      .toUpperCase();
    const value = Number(item.discountValue) || 0;
    if (type === "PERCENT") {
      return `${value}%`;
    }
    if (type === "AMOUNT") {
      return formatMoney(value);
    }
    return "-";
  };

  const computeDiscountedUnitPrice = (item) => {
    const unitPriceOriginal = Number(item?.sellingPrice) || 0;
    const result = computeItemDiscount({
      unitPriceOriginal,
      qty: 1,
      discountEnabled: item?.discountEnabled,
      discountType: item?.discountType,
      discountValue: item?.discountValue,
      startAt: item?.discountStartAt,
      endAt: item?.discountEndAt,
      minQty: item?.minQtyForDiscount,
      cap: item?.maxDiscountCap,
    });
    return result.unitPriceNet;
  };

  const buildSku = ({ nextCategory, nextBrand, nextName, nextVariant }) => {
    const categoryShort = shortFromWords(nextCategory, "GEN");
    const brandShort = shortFromValue(nextBrand, 3, "GEN");
    const itemToken = normalizeSegment(nextName);
    const variantToken = normalizeSegment(nextVariant);
    return [categoryShort, brandShort, itemToken, variantToken]
      .filter(Boolean)
      .join("-");
  };

  useEffect(() => {
    if (skuEdited) return;
    const generated = buildSku({
      nextCategory: category,
      nextBrand: brand,
      nextName: itemName,
      nextVariant: variant,
    });
    setSku(generated);
  }, [brand, category, itemName, skuEdited, variant]);

  const handleAuthRedirect = useCallback(
    (status) => {
      if (status === 401 || status === 403) {
        navigate("/login", { replace: true });
      }
    },
    [navigate]
  );

  const fetchCategories = useCallback(async () => {
    setCategoryError("");
    try {
      const { data } = await api.get("/inventory-categories");
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setCategoryError(
        error.response?.data?.message ||
          "Unable to load categories right now. Please try again."
      );
    }
  }, [handleAuthRedirect]);

  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.get("/inventory");
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setError(
        error.response?.data?.message ||
          "Unable to load inventory right now. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthRedirect]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleAddItem = async (event) => {
    event.preventDefault();
    const newItem = {
      itemName: itemName.trim(),
      category: category.trim(),
      brand: brand.trim(),
      variant: variant.trim(),
      quantity: Number(quantity) || 0,
      unit: unit.trim(),
      minStock: minStock !== "" ? Number(minStock) || 0 : 0,
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      sku: sku.trim(),
      notes: notes.trim(),
    };
    setIsSaving(true);
    setError("");
    try {
      await api.post("/inventory", newItem);
      setItemName("");
      setCategory("");
      setBrand("");
      setVariant("");
      setQuantity("");
      setUnit("");
      setMinStock("");
      setCostPrice("");
      setSellingPrice("");
      setSku("");
      setSkuEdited(false);
      setNotes("");
      await fetchInventory();
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setError(
        error.response?.data?.message ||
          "Unable to save inventory item. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setCategoryActionId("new");
    setCategoryError("");
    try {
      await api.post("/inventory-categories", { name: trimmed });
      setNewCategoryName("");
      await fetchCategories();
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setCategoryError(
        error.response?.data?.message ||
          "Unable to save category. Please try again."
      );
    } finally {
      setCategoryActionId("");
    }
  };

  const startCategoryEdit = (categoryItem) => {
    setEditingCategoryId(categoryItem._id || categoryItem.id);
    setCategoryDraft({ name: categoryItem.name || "" });
  };

  const cancelCategoryEdit = () => {
    setEditingCategoryId("");
    setCategoryDraft({ name: "" });
  };

  const handleUpdateCategory = async (id) => {
    const trimmed = categoryDraft.name.trim();
    if (!trimmed) return;
    setCategoryActionId(id);
    setCategoryError("");
    try {
      await api.put(`/inventory-categories/${id}`, { name: trimmed });
      await fetchCategories();
      cancelCategoryEdit();
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setCategoryError(
        error.response?.data?.message ||
          "Unable to update category. Please try again."
      );
    } finally {
      setCategoryActionId("");
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    setCategoryActionId(id);
    setCategoryError("");
    try {
      await api.delete(`/inventory-categories/${id}`);
      await fetchCategories();
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setCategoryError(
        error.response?.data?.message ||
          "Unable to delete category. Please try again."
      );
    } finally {
      setCategoryActionId("");
    }
  };

  const startEdit = (item) => {
    const itemId = item._id || item.id;
    setEditingId(itemId);
    setEditDraft({
      itemName: item.itemName || item.name || "",
      category: item.category || "",
      brand: item.brand || "",
      variant: item.variant || "",
      quantity: String(item.quantity ?? ""),
      unit: item.unit || "",
      minStock: String(item.minStock ?? ""),
      costPrice: String(item.costPrice ?? ""),
      sellingPrice: String(item.sellingPrice ?? ""),
      sku: item.sku || "",
    });
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditDraft({
      itemName: "",
      category: "",
      brand: "",
      variant: "",
      quantity: "",
      unit: "",
      minStock: "",
      costPrice: "",
      sellingPrice: "",
      sku: "",
    });
  };

  const handleEditChange = (field, value) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleUpdate = async (id) => {
    setRowActionId(id);
    setError("");
    try {
      await api.patch(`/inventory/${id}`, {
        itemName: editDraft.itemName.trim(),
        category: editDraft.category.trim(),
        brand: editDraft.brand.trim(),
        variant: editDraft.variant.trim(),
        quantity: Number(editDraft.quantity) || 0,
        unit: editDraft.unit.trim(),
        minStock: editDraft.minStock !== "" ? Number(editDraft.minStock) || 0 : 0,
        costPrice: Number(editDraft.costPrice) || 0,
        sellingPrice: Number(editDraft.sellingPrice) || 0,
        sku: editDraft.sku.trim(),
      });
      await fetchInventory();
      cancelEdit();
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setError(
        error.response?.data?.message ||
          "Unable to update inventory item. Please try again."
      );
      fetchInventory();
    } finally {
      setRowActionId("");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this inventory item?")) return;
    setRowActionId(id);
    setError("");
    try {
      await api.delete(`/inventory/${id}`);
      await fetchInventory();
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setError(
        error.response?.data?.message ||
          "Unable to delete inventory item. Please try again."
      );
      fetchInventory();
    } finally {
      setRowActionId("");
    }
  };

  const openDiscountModal = (item) => {
    setDiscountTarget(item);
    setDiscountDraft({
      discountEnabled: Boolean(item?.discountEnabled),
      discountType: item?.discountType || "PERCENT",
      discountValue: item?.discountValue !== undefined ? String(item.discountValue) : "",
      discountStartAt: toDateInputValue(item?.discountStartAt),
      discountEndAt: toDateInputValue(item?.discountEndAt),
      minQtyForDiscount:
        item?.minQtyForDiscount !== undefined && item?.minQtyForDiscount !== null
          ? String(item.minQtyForDiscount)
          : "1",
      maxDiscountCap:
        item?.maxDiscountCap !== undefined && item?.maxDiscountCap !== null
          ? String(item.maxDiscountCap)
          : "",
      discountNote: item?.discountNote || "",
    });
  };

  const closeDiscountModal = () => {
    setDiscountTarget(null);
    setDiscountDraft({
      discountEnabled: false,
      discountType: "PERCENT",
      discountValue: "",
      discountStartAt: "",
      discountEndAt: "",
      minQtyForDiscount: "1",
      maxDiscountCap: "",
      discountNote: "",
    });
    setIsSavingDiscount(false);
  };

  const handleSaveDiscount = async () => {
    if (!discountTarget) return;
    const id = discountTarget._id || discountTarget.id;
    if (!id) return;

    setIsSavingDiscount(true);
    setError("");
    try {
      await api.patch(`/inventory/${id}`, {
        discountEnabled: Boolean(discountDraft.discountEnabled),
        discountType: discountDraft.discountEnabled
          ? discountDraft.discountType
          : null,
        discountValue: discountDraft.discountEnabled
          ? Math.max(0, Number(discountDraft.discountValue) || 0)
          : 0,
        discountStartAt: discountDraft.discountEnabled && discountDraft.discountStartAt
          ? discountDraft.discountStartAt
          : null,
        discountEndAt: discountDraft.discountEnabled && discountDraft.discountEndAt
          ? discountDraft.discountEndAt
          : null,
        minQtyForDiscount: discountDraft.discountEnabled
          ? Math.max(1, Number(discountDraft.minQtyForDiscount) || 1)
          : 1,
        maxDiscountCap:
          discountDraft.discountEnabled && discountDraft.maxDiscountCap !== ""
            ? Math.max(0, Number(discountDraft.maxDiscountCap) || 0)
            : null,
        discountNote: discountDraft.discountNote.trim(),
      });
      await fetchInventory();
      closeDiscountModal();
    } catch (requestError) {
      handleAuthRedirect(requestError.response?.status);
      setError(
        requestError.response?.data?.message ||
          "Unable to update item discount right now. Please try again."
      );
    } finally {
      setIsSavingDiscount(false);
    }
  };

  return (
    <div className="inventory-page">
      <PageHeader title="Inventory" />

      <section className="inventory-card">
        <div className="inventory-card__head">
          <div>
            <h2>Add Inventory Item</h2>
            <p>Log new parts, fluids, and consumables in one quick form.</p>
          </div>
          {user?.role === "OWNER" ? (
            <button
              type="button"
              className="inventory-button inventory-button--ghost"
              onClick={() => setIsCategoryModalOpen(true)}
            >
              Manage Categories
            </button>
          ) : null}
        </div>
        {error ? <p>{error}</p> : null}
        <form className="inventory-form" onSubmit={handleAddItem}>
          <div className="inventory-grid inventory-grid--two">
            <div className="inventory-field">
              <label htmlFor="inventory-name">Item Name</label>
              <input
                id="inventory-name"
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                required
              />
            </div>
            <div className="inventory-field">
              <label htmlFor="inventory-category">Category</label>
              <select
                id="inventory-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                required
              >
                <option value="">Select category</option>
                {activeCategories.length === 0 ? (
                  <option value="" disabled>
                    No active categories available
                  </option>
                ) : (
                  activeCategories.map((option) => (
                    <option key={option._id} value={option.name}>
                      {option.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="inventory-grid inventory-grid--two">
            <div className="inventory-field">
              <label htmlFor="inventory-brand">Brand (optional)</label>
              <input
                id="inventory-brand"
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
              />
            </div>
            <div className="inventory-field">
              <label htmlFor="inventory-variant">Variant / Pack Size</label>
              <input
                id="inventory-variant"
                value={variant}
                onChange={(event) => setVariant(event.target.value)}
                placeholder="e.g., 1L, 4L"
              />
            </div>
          </div>

          <div className="inventory-grid inventory-grid--two">
            <div className="inventory-field">
              <label htmlFor="inventory-unit">Unit</label>
              <select
                id="inventory-unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                required
              >
                <option value="">Select unit</option>
                {unitOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                  ))}
                </select>
              </div>
            <div className="inventory-field">
              <label htmlFor="inventory-quantity">Quantity</label>
              <input
                id="inventory-quantity"
                type="number"
                min="0"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="inventory-grid inventory-grid--two">
            <div className="inventory-field">
              <label htmlFor="inventory-min-stock">Minimum Stock</label>
              <input
                id="inventory-min-stock"
                type="number"
                min="0"
                value={minStock}
                onChange={(event) => setMinStock(event.target.value)}
              />
            </div>
          </div>

          <div className="inventory-pricing">
            <h3>Pricing</h3>
            <div className="inventory-grid inventory-grid--two">
              <div className="inventory-field">
                <label htmlFor="inventory-cost">Cost Price</label>
                <input
                  id="inventory-cost"
                  type="text"
                  inputMode="decimal"
                  value={isCostFocused ? costPrice : formatLkr(costPrice)}
                  onChange={(event) =>
                    setCostPrice(sanitizePriceInput(event.target.value))
                  }
                  onFocus={() => setIsCostFocused(true)}
                  onBlur={() => {
                    setIsCostFocused(false);
                    setCostPrice((prev) => normalizePriceValue(prev));
                  }}
                  required
                />
              </div>
              <div className="inventory-field">
                <label htmlFor="inventory-selling">Selling Price</label>
                <input
                  id="inventory-selling"
                  type="text"
                  inputMode="decimal"
                  value={isSellingFocused ? sellingPrice : formatLkr(sellingPrice)}
                  onChange={(event) =>
                    setSellingPrice(sanitizePriceInput(event.target.value))
                  }
                  onFocus={() => setIsSellingFocused(true)}
                  onBlur={() => {
                    setIsSellingFocused(false);
                    setSellingPrice((prev) => normalizePriceValue(prev));
                  }}
                  required
                />
              </div>
            </div>
            {Number(sellingPrice) < Number(costPrice) ? (
              <p className="inventory-warning">
                Selling price should be higher than cost price.
              </p>
            ) : null}
          </div>

          <div className="inventory-sku">
            <div className="inventory-field">
              <label htmlFor="inventory-sku">SKU</label>
              <input
                id="inventory-sku"
                value={sku}
                onChange={(event) => {
                  setSku(event.target.value);
                  setSkuEdited(true);
                }}
              />
            </div>
          </div>

          <div className="inventory-field">
            <label htmlFor="inventory-notes">Notes (optional)</label>
            <textarea
              id="inventory-notes"
              rows="3"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="inventory-actions">
            <button
              className="inventory-button inventory-button--primary"
              type="submit"
              disabled={!isFormValid || isSaving}
            >
              Save Item
            </button>
          </div>
        </form>
      </section>

      <section className="inventory-card">
        <div className="inventory-card__head">
          <div>
            <h2>Inventory Items</h2>
            <p>Monitor stock levels and update quantities instantly.</p>
          </div>
        </div>
        {isLoading ? (
          <div className="inventory-empty">Loading inventory items...</div>
        ) : items.length === 0 ? (
          <div className="inventory-empty">
            No inventory items yet. Add your first item above.
          </div>
        ) : (
          <div className="inventory-table">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Variant</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Minimum Stock</th>
                  <th>Cost Price</th>
                  <th>Selling Price</th>
                  <th>Discount</th>
                  <th>Discounted Unit Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isLow = Number(item.quantity) <= Number(item.minStock);
                  const itemId = item._id || item.id;
                  const isEditing = editingId === itemId;
                  return (
                    <tr key={itemId} className={isLow ? "is-low" : ""}>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            value={editDraft.sku}
                            onChange={(event) =>
                              handleEditChange("sku", event.target.value)
                            }
                          />
                        ) : (
                          item.sku || "-"
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            value={editDraft.itemName}
                            onChange={(event) =>
                              handleEditChange("itemName", event.target.value)
                            }
                          />
                        ) : (
                          item.itemName || item.name
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className="inventory-table__input"
                            value={editDraft.category}
                            onChange={(event) =>
                              handleEditChange("category", event.target.value)
                            }
                          >
                            <option value="">Select category</option>
                            {allCategoryOptions.map((option) => (
                              <option key={option.id} value={option.name}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          item.category
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            value={editDraft.brand}
                            onChange={(event) =>
                              handleEditChange("brand", event.target.value)
                            }
                          />
                        ) : (
                          item.brand || "-"
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            value={editDraft.variant}
                            onChange={(event) =>
                              handleEditChange("variant", event.target.value)
                            }
                          />
                        ) : (
                          item.variant || "-"
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            type="number"
                            min="0"
                            value={editDraft.quantity}
                            onChange={(event) =>
                              handleEditChange("quantity", event.target.value)
                            }
                          />
                        ) : (
                          item.quantity
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className="inventory-table__input"
                            value={editDraft.unit}
                            onChange={(event) =>
                              handleEditChange("unit", event.target.value)
                            }
                          >
                            <option value="">Select unit</option>
                            {unitOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          item.unit
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            type="number"
                            min="0"
                            value={editDraft.minStock}
                            onChange={(event) =>
                              handleEditChange("minStock", event.target.value)
                            }
                          />
                        ) : (
                          item.minStock
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            type="text"
                            inputMode="decimal"
                            pattern="\\d*(\\.\\d{0,2})?"
                            value={editDraft.costPrice}
                            onChange={(event) =>
                              handleEditChange(
                                "costPrice",
                                sanitizePriceInput(event.target.value)
                              )
                            }
                          />
                        ) : (
                          item.costPrice ?? "-"
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inventory-table__input"
                            type="text"
                            inputMode="decimal"
                            pattern="\\d*(\\.\\d{0,2})?"
                            value={editDraft.sellingPrice}
                            onChange={(event) =>
                              handleEditChange(
                                "sellingPrice",
                                sanitizePriceInput(event.target.value)
                              )
                            }
                          />
                        ) : (
                          item.sellingPrice ?? "-"
                        )}
                      </td>
                      <td>{formatDiscountLabel(item)}</td>
                      <td>{formatMoney(computeDiscountedUnitPrice(item))}</td>
                      <td>
                        <span
                          className={`inventory-status ${
                            isLow ? "inventory-status--low" : ""
                          }`}
                        >
                          {isLow ? "Low Stock" : "OK"}
                        </span>
                      </td>
                      <td>
                        <div className="inventory-row-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="inventory-action-button inventory-action-button--primary"
                                onClick={() => handleUpdate(itemId)}
                                disabled={rowActionId === itemId}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="inventory-action-button"
                                onClick={cancelEdit}
                                disabled={rowActionId === itemId}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="inventory-action-button inventory-action-button--primary"
                                onClick={() => startEdit(item)}
                                disabled={rowActionId === itemId}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="inventory-action-button"
                                onClick={() => openDiscountModal(item)}
                                disabled={rowActionId === itemId}
                              >
                                Discount
                              </button>
                              <button
                                type="button"
                                className="inventory-action-button inventory-action-button--danger"
                                onClick={() => handleDelete(itemId)}
                                disabled={rowActionId === itemId}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {discountTarget ? (
        <div className="inventory-modal__overlay" role="dialog" aria-modal="true">
          <div className="inventory-modal inventory-modal--discount">
            <div className="inventory-modal__head">
              <div>
                <h2>Item Discount</h2>
                <p>
                  Configure predefined discount for{" "}
                  <strong>{discountTarget.itemName || discountTarget.name}</strong>.
                </p>
              </div>
              <button
                type="button"
                className="inventory-action-button"
                onClick={closeDiscountModal}
                disabled={isSavingDiscount}
              >
                Close
              </button>
            </div>

            <div className="inventory-grid inventory-grid--two">
              <div className="inventory-field">
                <label htmlFor="discount-enabled">Enable Discount</label>
                <input
                  id="discount-enabled"
                  type="checkbox"
                  checked={discountDraft.discountEnabled}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      discountEnabled: event.target.checked,
                    }))
                  }
                />
              </div>
              <div className="inventory-field">
                <label htmlFor="discount-type">Discount Type</label>
                <select
                  id="discount-type"
                  value={discountDraft.discountType}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      discountType: event.target.value,
                    }))
                  }
                  disabled={!discountDraft.discountEnabled}
                >
                  <option value="PERCENT">Percent (%)</option>
                  <option value="AMOUNT">Amount (LKR)</option>
                </select>
              </div>
            </div>

            <div className="inventory-grid inventory-grid--two">
              <div className="inventory-field">
                <label htmlFor="discount-value">
                  Discount Value{" "}
                  {discountDraft.discountType === "PERCENT" ? "(%)" : "(LKR)"}
                </label>
                <input
                  id="discount-value"
                  type="number"
                  min="0"
                  value={discountDraft.discountValue}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      discountValue: event.target.value,
                    }))
                  }
                  disabled={!discountDraft.discountEnabled}
                />
              </div>
              <div className="inventory-field">
                <label htmlFor="discount-min-qty">Minimum Qty</label>
                <input
                  id="discount-min-qty"
                  type="number"
                  min="1"
                  value={discountDraft.minQtyForDiscount}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      minQtyForDiscount: event.target.value,
                    }))
                  }
                  disabled={!discountDraft.discountEnabled}
                />
              </div>
            </div>

            <div className="inventory-grid inventory-grid--two">
              <div className="inventory-field">
                <label htmlFor="discount-start">Start Date (optional)</label>
                <input
                  id="discount-start"
                  type="date"
                  value={discountDraft.discountStartAt}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      discountStartAt: event.target.value,
                    }))
                  }
                  disabled={!discountDraft.discountEnabled}
                />
              </div>
              <div className="inventory-field">
                <label htmlFor="discount-end">End Date (optional)</label>
                <input
                  id="discount-end"
                  type="date"
                  value={discountDraft.discountEndAt}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      discountEndAt: event.target.value,
                    }))
                  }
                  disabled={!discountDraft.discountEnabled}
                />
              </div>
            </div>

            <div className="inventory-grid inventory-grid--two">
              <div className="inventory-field">
                <label htmlFor="discount-cap">Max Discount Cap (LKR)</label>
                <input
                  id="discount-cap"
                  type="number"
                  min="0"
                  value={discountDraft.maxDiscountCap}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      maxDiscountCap: event.target.value,
                    }))
                  }
                  disabled={!discountDraft.discountEnabled}
                  placeholder="Optional"
                />
              </div>
              <div className="inventory-field">
                <label htmlFor="discount-note">Note (optional)</label>
                <input
                  id="discount-note"
                  value={discountDraft.discountNote}
                  onChange={(event) =>
                    setDiscountDraft((prev) => ({
                      ...prev,
                      discountNote: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="inventory-actions">
              <button
                type="button"
                className="inventory-button inventory-button--ghost"
                onClick={closeDiscountModal}
                disabled={isSavingDiscount}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inventory-button inventory-button--primary"
                onClick={handleSaveDiscount}
                disabled={isSavingDiscount}
              >
                Save Discount
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCategoryModalOpen ? (
        <div
          className="inventory-modal__overlay"
          role="dialog"
          aria-modal="true"
        >
          <div className="inventory-modal">
            <div className="inventory-modal__head">
              <div>
                <h2>Inventory Categories</h2>
                <p>Manage the list of categories available for inventory.</p>
              </div>
              <button
                type="button"
                className="inventory-action-button"
                onClick={() => setIsCategoryModalOpen(false)}
              >
                Close
              </button>
            </div>

            {categoryError ? (
              <p className="inventory-warning">{categoryError}</p>
            ) : null}

            <div className="inventory-modal__add">
              <div className="inventory-field">
                <label htmlFor="new-category-name">Category name</label>
                <input
                  id="new-category-name"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="inventory-action-button inventory-action-button--primary"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim() || categoryActionId === "new"}
              >
                Add Category
              </button>
            </div>

            <div className="inventory-modal__list">
              {categories.length === 0 ? (
                <p className="inventory-empty">No categories yet.</p>
              ) : (
                categories.map((categoryItem) => {
                  const categoryId = categoryItem._id || categoryItem.id;
                  const isEditingCategory = editingCategoryId === categoryId;
                  return (
                    <div className="inventory-modal__row" key={categoryId}>
                      {isEditingCategory ? (
                        <input
                          className="inventory-table__input"
                          value={categoryDraft.name}
                          onChange={(event) =>
                            setCategoryDraft({ name: event.target.value })
                          }
                        />
                      ) : (
                        <div>
                          <strong>{categoryItem.name}</strong>
                          <span>
                            {categoryItem.active === false
                              ? "Inactive"
                              : "Active"}
                          </span>
                        </div>
                      )}

                      <div className="inventory-row-actions">
                        {isEditingCategory ? (
                          <>
                            <button
                              type="button"
                              className="inventory-action-button inventory-action-button--primary"
                              onClick={() => handleUpdateCategory(categoryId)}
                              disabled={categoryActionId === categoryId}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="inventory-action-button"
                              onClick={cancelCategoryEdit}
                              disabled={categoryActionId === categoryId}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="inventory-action-button inventory-action-button--primary"
                              onClick={() => startCategoryEdit(categoryItem)}
                              disabled={categoryActionId === categoryId}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inventory-action-button inventory-action-button--danger"
                              onClick={() => handleDeleteCategory(categoryId)}
                              disabled={categoryActionId === categoryId}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryPage;
