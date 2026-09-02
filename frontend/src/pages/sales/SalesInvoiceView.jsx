import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./SalesInvoiceView.css";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatPaymentMethod = (method) =>
  String(method || "CASH")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function SalesInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [sale, setSale] = useState(null);
  const [error, setError] = useState("");
  const [hasPrinted, setHasPrinted] = useState(false);
  const shouldAutoPrint = useMemo(
    () => new URLSearchParams(location.search).get("print") === "1",
    [location.search]
  );

  useEffect(() => {
    const fetchSale = async () => {
      setError("");
      try {
        const { data } = await api.get(`/sales/${id}`);
        setSale(data);
      } catch (requestError) {
        if (requestError.response?.status === 401 || requestError.response?.status === 403) {
          navigate("/login", { replace: true });
          return;
        }
        setError(
          requestError.response?.data?.message || "Unable to load sale invoice details."
        );
      }
    };

    fetchSale();
  }, [id, navigate]);

  useEffect(() => {
    if (!sale || !shouldAutoPrint || hasPrinted) return;

    setHasPrinted(true);
    const previousTitle = document.title;
    document.title = `Sales Invoice ${sale.saleNumber}`;
    window.setTimeout(() => window.print(), 250);
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 900);
  }, [sale, shouldAutoPrint, hasPrinted]);

  if (!sale) {
    return (
      <div className="sales-invoice-page">
        <div className="no-print">
          <PageHeader title="Sales Invoice" />
        </div>
        <div className="sales-invoice-shell sales-invoice-shell--loading">
          {error ? <p className="sales-invoice-error">{error}</p> : <p>Loading invoice...</p>}
          <Link to="/sales" className="sales-invoice-back no-print">
            Back to Sales
          </Link>
        </div>
      </div>
    );
  }

  const itemsSubtotalOriginal =
    sale.itemsSubtotalOriginal !== undefined && sale.itemsSubtotalOriginal !== null
      ? Number(sale.itemsSubtotalOriginal) || 0
      : (sale.items || []).reduce((sum, item) => {
          const qty = Number(item.quantity) || 0;
          const unitOriginal =
            Number(item.unitPriceOriginal) || Number(item.unitPrice) || 0;
          const lineOriginal =
            Number(item.lineTotalOriginal) || Math.max(0, qty * unitOriginal);
          return sum + lineOriginal;
        }, 0);

  const itemDiscountTotal =
    sale.itemDiscountTotal !== undefined && sale.itemDiscountTotal !== null
      ? Number(sale.itemDiscountTotal) || 0
      : (sale.items || []).reduce(
          (sum, item) => sum + (Number(item.lineDiscountTotal) || 0),
          0
        );

  const subtotalAfterItemDiscount = Number(sale.subtotal) || 0;
  const invoiceDiscount = Number(sale.discount) || 0;
  const taxAmount = Number(sale.tax) || 0;
  const grandTotal = Number(sale.grandTotal) || 0;

  return (
    <div className="sales-invoice-page">
      <div className="no-print">
        <PageHeader title={`Sales Invoice ${sale.saleNumber}`} />
      </div>

      <div className="sales-invoice-shell">
        <header className="sales-invoice-header">
          <div>
            <h1>SENEVI AUTO CARE</h1>
            <p>Mathawa, Wewagama</p>
            <p>Tel - 0765336448</p>
          </div>
          <div className="sales-invoice-title-block">
            <button
              type="button"
              className="sales-invoice-print no-print"
              onClick={() => window.print()}
            >
              Print Invoice
            </button>
            <span className="sales-invoice-title">SALES INVOICE</span>
            <span className="sales-invoice-number">{sale.saleNumber}</span>
            {sale.status === "PAID" ? <span className="sales-paid-stamp">PAID</span> : null}
          </div>
        </header>

        {error ? <p className="sales-invoice-error">{error}</p> : null}

        <section className="sales-invoice-meta">
          <div>
            <h2>Invoice Info</h2>
            <div>
              <span>Invoice No:</span>
              <strong>{sale.saleNumber}</strong>
            </div>
            <div>
              <span>Date / Time:</span>
              <strong>
                {sale.saleDate ? new Date(sale.saleDate).toLocaleString() : "-"}
              </strong>
            </div>
            <div>
              <span>Status:</span>
              <strong>{sale.status}</strong>
            </div>
          </div>

          <div>
            <h2>Cashier & Payment</h2>
            <div>
              <span>Cashier:</span>
              <strong>{sale.soldBy?.name || "-"}</strong>
            </div>
            <div>
              <span>Payment Method:</span>
              <strong>{formatPaymentMethod(sale.paymentMethod)}</strong>
            </div>
          </div>
        </section>

        <section className="sales-invoice-section">
          <h2>Items</h2>
          <div className="sales-invoice-table">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="right">Qty</th>
                  <th className="right">Unit Price (Original)</th>
                  <th className="right">Discount</th>
                  <th className="right">Unit Price (Net)</th>
                  <th className="right">Line Total (Net)</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((item, index) => {
                  const qty = Number(item.quantity) || 0;
                  const unitPriceOriginal =
                    Number(item.unitPriceOriginal) || Number(item.unitPrice) || 0;
                  const discountLine = Number(item.lineDiscountTotal) || 0;
                  const unitPriceNet =
                    Number(item.unitPriceNet) ||
                    Math.max(0, (Number(item.lineTotal) || 0) / Math.max(1, qty));
                  const lineTotalNet =
                    Number(item.lineTotal) ||
                    Math.max(0, qty * unitPriceNet);
                  return (
                    <tr key={`${item.productId}-${index}`}>
                      <td>{item.productName}</td>
                      <td>{item.sku}</td>
                      <td className="right">{qty}</td>
                      <td className="right">{formatCurrency(unitPriceOriginal)}</td>
                      <td className="right">-{formatCurrency(discountLine)}</td>
                      <td className="right">{formatCurrency(unitPriceNet)}</td>
                      <td className="right">{formatCurrency(lineTotalNet)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sales-invoice-totals">
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
            <strong>-{formatCurrency(invoiceDiscount)}</strong>
          </div>
          <div>
            <span>Tax</span>
            <strong>{formatCurrency(taxAmount)}</strong>
          </div>
          <div className="sales-invoice-grand">
            <span>Grand Total</span>
            <strong>{formatCurrency(grandTotal)}</strong>
          </div>
        </section>

        <footer className="sales-invoice-footer">
          <p>Thank you for your purchase.</p>
          <Link to="/sales" className="sales-invoice-back no-print">
            Back to Sales
          </Link>
        </footer>
      </div>
    </div>
  );
}

export default SalesInvoiceView;
