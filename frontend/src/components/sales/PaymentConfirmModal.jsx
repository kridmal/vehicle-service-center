function PaymentConfirmModal({
  open,
  actionLabel,
  totalLabel,
  paymentMethod,
  onCancel,
  onConfirm,
  isSubmitting,
}) {
  if (!open) return null;

  return (
    <div className="sales-modal-overlay" role="dialog" aria-modal="true">
      <div className="sales-modal">
        <h3>Confirm Payment</h3>
        <p>
          Proceed with <strong>{actionLabel}</strong> for <strong>{totalLabel}</strong>?
        </p>
        <p>Payment Method: {paymentMethod}</p>
        <div className="sales-modal-actions">
          <button
            type="button"
            className="sales-secondary-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sales-primary-button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Processing..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PaymentConfirmModal;
