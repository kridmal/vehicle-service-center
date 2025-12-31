const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

export const getInvoiceDate = (invoice) => {
  return toDate(invoice.payment?.paidAt) || toDate(invoice.createdAt);
};

export const isWithinRange = (date, from, to) => {
  if (!date) return false;
  if (from && date < startOfDay(from)) return false;
  if (to && date > endOfDay(to)) return false;
  return true;
};

export const parseDateInput = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const formatDateInput = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getWeekStart = (date) => {
  const day = date.getDay() || 7;
  const diff = day === 1 ? 0 : day - 1;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  return startOfDay(start);
};

export const sumInvoiceTotals = (invoices) =>
  invoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);

export const sumPaidAmounts = (invoices) =>
  invoices.reduce(
    (sum, invoice) => sum + (Number(invoice.payment?.paidAmount) || 0),
    0
  );

export const sumOutstandingAmounts = (invoices) =>
  invoices.reduce((sum, invoice) => {
    const total = Number(invoice.total) || 0;
    const paid = Number(invoice.payment?.paidAmount) || 0;
    return sum + Math.max(0, total - paid);
  }, 0);

export const getTopItems = (invoices, type) => {
  const counts = new Map();
  invoices.forEach((invoice) => {
    invoice.items?.forEach((item) => {
      if (item.type !== type) return;
      const name = item.name || "Unnamed";
      const qty = Number(item.qty) || 0;
      counts.set(name, (counts.get(name) || 0) + (qty || 1));
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
};
