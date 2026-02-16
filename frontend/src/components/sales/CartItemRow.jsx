function CartItemRow({
  item,
  onIncrease,
  onDecrease,
  onRemove,
  formatCurrency,
}) {
  return (
    <tr>
      <td>
        <div className="sales-cart-item__name">{item.productName}</div>
        <div className="sales-cart-item__sku">{item.sku}</div>
      </td>
      <td>
        <div className="sales-qty-control">
          <button
            type="button"
            onClick={() => onDecrease(item.productId)}
            disabled={item.quantity <= 1}
            aria-label={`Decrease ${item.productName}`}
          >
            -
          </button>
          <span>{item.quantity}</span>
          <button
            type="button"
            onClick={() => onIncrease(item.productId)}
            disabled={item.quantity >= item.availableStock}
            aria-label={`Increase ${item.productName}`}
          >
            +
          </button>
        </div>
      </td>
      <td className="sales-cell-right">
        {formatCurrency(item.unitPriceOriginal ?? item.unitPrice)}
      </td>
      <td className="sales-cell-right">
        -{formatCurrency(item.lineDiscountTotal || 0)}
      </td>
      <td className="sales-cell-right">
        {formatCurrency(item.unitPriceNet ?? item.unitPrice)}
      </td>
      <td className="sales-cell-right">
        {formatCurrency(item.lineTotalNet ?? item.unitPrice * item.quantity)}
      </td>
      <td className="sales-cell-right">
        <button
          type="button"
          className="sales-link-button sales-link-button--danger"
          onClick={() => onRemove(item.productId)}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

export default CartItemRow;
