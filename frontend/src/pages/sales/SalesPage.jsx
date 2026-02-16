import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import CartItemRow from "../../components/sales/CartItemRow.jsx";
import PaymentConfirmModal from "../../components/sales/PaymentConfirmModal.jsx";
import ProductTable from "../../components/sales/ProductTable.jsx";
import api from "../../services/api.js";
import { computeItemDiscount } from "../../utils/itemDiscount.js";
import "./SalesPage.css";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const buildCartItem = (source, quantityInput) => {
  const quantity = Math.max(1, Number(quantityInput) || 1);
  const unitPriceOriginal = Number(
    source.sellingPrice ?? source.unitPriceOriginal ?? source.unitPrice
  ) || 0;
  const discountResult = computeItemDiscount({
    unitPriceOriginal,
    qty: quantity,
    discountEnabled: source.discountEnabled,
    discountType: source.discountType,
    discountValue: source.discountValue,
    startAt: source.discountStartAt,
    endAt: source.discountEndAt,
    minQty: source.minQtyForDiscount,
    cap: source.maxDiscountCap,
  });

  return {
    productId: source._id || source.productId,
    productName: source.itemName || source.productName,
    sku: source.sku || "",
    quantity,
    unitPriceOriginal,
    discountPerUnit: discountResult.discountPerUnit,
    unitPriceNet: discountResult.unitPriceNet,
    lineTotalOriginal: (Number(unitPriceOriginal) || 0) * quantity,
    lineDiscountTotal: discountResult.lineDiscountTotal,
    lineTotalNet: discountResult.lineTotalNet,
    unitPrice: discountResult.unitPriceNet,
    availableStock: Number(source.availableStock ?? source.quantity) || 0,
    discountEnabled: Boolean(source.discountEnabled),
    discountType: source.discountType || null,
    discountValue: Number(source.discountValue) || 0,
    discountStartAt: source.discountStartAt || null,
    discountEndAt: source.discountEndAt || null,
    minQtyForDiscount: Number(source.minQtyForDiscount) || 1,
    maxDiscountCap:
      source.maxDiscountCap !== undefined && source.maxDiscountCap !== null
        ? Number(source.maxDiscountCap)
        : null,
  };
};

function SalesPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [discountType, setDiscountType] = useState("AMOUNT");
  const [discountValue, setDiscountValue] = useState("0");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const searchTerm = search.trim();

  const handleAuthRedirect = useCallback(
    (status) => {
      if (status === 401 || status === 403) {
        navigate("/login", { replace: true });
      }
    },
    [navigate]
  );

  const fetchProducts = useCallback(
    async (nextSearch = "") => {
      const resolvedSearch = String(nextSearch || "").trim();
      if (!resolvedSearch) {
        setProducts([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/sales/products", {
          params: { search: resolvedSearch },
        });
        const productList = Array.isArray(data) ? data : [];
        setProducts(productList);
        setCart((previousCart) =>
          previousCart
            .map((item) => {
              const latest = productList.find((product) => product._id === item.productId);
              if (!latest) return item;

              const availableStock = Number(latest.quantity) || 0;
              const nextQuantity = Math.min(item.quantity, availableStock);
              if (nextQuantity <= 0) return null;

              return buildCartItem(
                { ...latest, productId: latest._id, quantity: availableStock },
                nextQuantity
              );
            })
            .filter(Boolean)
        );
      } catch (requestError) {
        handleAuthRedirect(requestError.response?.status);
        setError(
          requestError.response?.data?.message ||
            "Unable to load saleable products right now."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [handleAuthRedirect]
  );

  useEffect(() => {
    if (!searchTerm) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      fetchProducts(searchTerm);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm, fetchProducts]);

  const itemsSubtotalOriginal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + (Number(item.lineTotalOriginal) || 0),
        0
      ),
    [cart]
  );

  const itemDiscountTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.lineDiscountTotal) || 0), 0),
    [cart]
  );

  const subtotalAfterItemDiscount = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.lineTotalNet) || 0), 0),
    [cart]
  );

  const invoiceDiscountAmount = useMemo(() => {
    const rawDiscount = Math.max(0, Number(discountValue) || 0);
    if (discountType === "PERCENT") {
      return Math.min(
        subtotalAfterItemDiscount,
        (subtotalAfterItemDiscount * Math.min(rawDiscount, 100)) / 100
      );
    }
    return Math.min(subtotalAfterItemDiscount, rawDiscount);
  }, [discountType, discountValue, subtotalAfterItemDiscount]);

  const taxableTotal = Math.max(0, subtotalAfterItemDiscount - invoiceDiscountAmount);
  const computedTax = taxEnabled
    ? (taxableTotal * Math.max(0, Number(taxRate) || 0)) / 100
    : 0;
  const grandTotal = taxableTotal + computedTax;

  const addProductToCart = (product) => {
    const availableStock = Number(product.quantity) || 0;
    if (availableStock <= 0) {
      setError("Cannot add this item because it is out of stock.");
      return;
    }

    const existing = cart.find((item) => item.productId === product._id);
    if (existing && existing.quantity >= existing.availableStock) {
      setError(`Cannot exceed available stock for ${existing.productName}.`);
      return;
    }

    setError("");
    setNotice("");
    setCart((previousCart) => {
      const index = previousCart.findIndex((item) => item.productId === product._id);
      if (index === -1) {
        return [...previousCart, buildCartItem({ ...product, quantity: availableStock }, 1)];
      }

      return previousCart.map((item, itemIndex) =>
        itemIndex === index ? buildCartItem(item, item.quantity + 1) : item
      );
    });
  };

  const changeQuantity = (productId, direction) => {
    const targetItem = cart.find((item) => item.productId === productId);
    if (!targetItem) return;

    if (direction === "inc" && targetItem.quantity >= targetItem.availableStock) {
      setError(`Cannot exceed available stock for ${targetItem.productName}.`);
      return;
    }

    setError("");
    setCart((previousCart) =>
      previousCart.map((item) => {
        if (item.productId !== productId) return item;
        if (direction === "dec") {
          return buildCartItem(item, Math.max(1, item.quantity - 1));
        }
        return buildCartItem(item, item.quantity + 1);
      })
    );
  };

  const removeFromCart = (productId) => {
    setCart((previousCart) => previousCart.filter((item) => item.productId !== productId));
  };

  const cancelCurrentSale = () => {
    setCart([]);
    setDiscountType("AMOUNT");
    setDiscountValue("0");
    setTaxEnabled(false);
    setTaxRate("0");
    setPaymentMethod("CASH");
    setShowPaymentConfirm(false);
    setError("");
    setNotice("");
  };

  const submitSale = async () => {
    if (cart.length === 0) {
      setError("Add at least one item to the cart.");
      return;
    }

    if (cart.some((item) => Number(item.quantity) > Number(item.availableStock))) {
      setError("One or more items exceed available stock.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        status: "PAID",
        paymentMethod,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        discount: {
          type: discountType,
          value: Math.max(0, Number(discountValue) || 0),
        },
        tax: {
          enabled: taxEnabled,
          rate: Math.max(0, Number(taxRate) || 0),
        },
      };

      const { data } = await api.post("/sales", payload);
      setLastSale({
        id: data._id,
        saleNumber: data.saleNumber,
      });
      setCart([]);
      await fetchProducts(search.trim());

      const invoiceUrl = `${window.location.origin}/sales/${data._id}/invoice?print=1`;
      const opened = window.open(invoiceUrl, "_blank");
      setNotice(
        opened
          ? `Sale ${data.saleNumber} completed successfully.`
          : `Sale ${data.saleNumber} completed. Pop-up blocked; use Print Invoice below.`
      );
    } catch (requestError) {
      handleAuthRedirect(requestError.response?.status);
      setError(
        requestError.response?.data?.message ||
          "Unable to save sale right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sales-page">
      <PageHeader title="Sales / POS" />

      {error ? <p className="sales-error">{error}</p> : null}
      {notice ? <p className="sales-notice">{notice}</p> : null}

      {lastSale ? (
        <div className="sales-last-sale">
          <span>Last Sale: {lastSale.saleNumber}</span>
          <Link
            className="sales-primary-button"
            to={`/sales/${lastSale.id}/invoice?print=1`}
            target="_blank"
            rel="noreferrer"
          >
            Print Invoice
          </Link>
        </div>
      ) : null}

      <section className="sales-workspace">
        <div className="sales-block">
          <div className="sales-panel-head">
            <h2>Products</h2>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by item name or SKU"
            />
          </div>

          {isLoading ? (
            <div className="sales-loading">Loading products...</div>
          ) : (
            <ProductTable
              products={products}
              onAdd={addProductToCart}
              emptyMessage={
                searchTerm
                  ? "No matching products."
                  : "Type in search to find products."
              }
            />
          )}
        </div>

        <div className="sales-block">
          <div className="sales-panel-head">
            <h2>Cart</h2>
          </div>

          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="sales-cell-right">Qty</th>
                  <th className="sales-cell-right">Unit Price (Original)</th>
                  <th className="sales-cell-right">Discount</th>
                  <th className="sales-cell-right">Unit Price (Net)</th>
                  <th className="sales-cell-right">Line Total (Net)</th>
                  <th className="sales-cell-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="sales-empty-cell">
                      Cart is empty.
                    </td>
                  </tr>
                ) : (
                  cart.map((item) => (
                    <CartItemRow
                      key={item.productId}
                      item={item}
                      onIncrease={(productId) => changeQuantity(productId, "inc")}
                      onDecrease={(productId) => changeQuantity(productId, "dec")}
                      onRemove={removeFromCart}
                      formatCurrency={formatCurrency}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="sales-summary">
            <div className="sales-form-grid">
              <div className="sales-field-grid">
                <label htmlFor="discount-type">Invoice Discount Type</label>
                <select
                  id="discount-type"
                  value={discountType}
                  onChange={(event) => setDiscountType(event.target.value)}
                >
                  <option value="AMOUNT">Amount</option>
                  <option value="PERCENT">Percent</option>
                </select>
              </div>

              <div className="sales-field-grid">
                <label htmlFor="discount-value">
                  Invoice Discount (Optional) {discountType === "PERCENT" ? "(%)" : "(LKR)"}
                </label>
                <input
                  id="discount-value"
                  type="number"
                  min="0"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                />
              </div>

              <div className="sales-field-grid">
                <label htmlFor="tax-toggle">Apply Tax</label>
                <input
                  id="tax-toggle"
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(event) => setTaxEnabled(event.target.checked)}
                />
              </div>

              {taxEnabled ? (
                <div className="sales-field-grid">
                  <label htmlFor="tax-rate">Tax Rate (%)</label>
                  <input
                    id="tax-rate"
                    type="number"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(event) => setTaxRate(event.target.value)}
                  />
                </div>
              ) : null}

              <div className="sales-field-grid">
                <label htmlFor="payment-method">Payment Method</label>
                <select
                  id="payment-method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="sales-total-block">
              <div>
                <span>Items Subtotal (Original)</span>
                <strong>{formatCurrency(itemsSubtotalOriginal)}</strong>
              </div>
              <div>
                <span>Items Discount</span>
                <strong>-{formatCurrency(itemDiscountTotal)}</strong>
              </div>
              <div>
                <span>Subtotal (After item discounts)</span>
                <strong>{formatCurrency(subtotalAfterItemDiscount)}</strong>
              </div>
              <div>
                <span>Invoice Discount (Optional)</span>
                <strong>-{formatCurrency(invoiceDiscountAmount)}</strong>
              </div>
              <div>
                <span>Tax</span>
                <strong>{formatCurrency(computedTax)}</strong>
              </div>
              <div className="sales-total-block__grand">
                <span>Grand Total</span>
                <strong>{formatCurrency(grandTotal)}</strong>
              </div>
            </div>

            <div className="sales-action-row">
              <button
                type="button"
                className="sales-secondary-button"
                disabled={isSubmitting}
                onClick={cancelCurrentSale}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sales-primary-button"
                disabled={isSubmitting || cart.length === 0}
                onClick={() => setShowPaymentConfirm(true)}
              >
                Paid
              </button>
            </div>
          </div>
        </div>
      </section>

      <PaymentConfirmModal
        open={showPaymentConfirm}
        actionLabel="PAID"
        totalLabel={formatCurrency(grandTotal)}
        paymentMethod={paymentMethod.replace("_", " ")}
        onCancel={() => setShowPaymentConfirm(false)}
        onConfirm={async () => {
          setShowPaymentConfirm(false);
          await submitSale();
        }}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export default SalesPage;
