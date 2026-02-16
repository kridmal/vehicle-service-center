const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toOptionalDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export const computeItemDiscount = ({
  unitPriceOriginal,
  qty,
  discountEnabled,
  discountType,
  discountValue,
  startAt,
  endAt,
  minQty,
  cap,
  now = new Date(),
}) => {
  const safeUnitPrice = Math.max(0, toNumber(unitPriceOriginal));
  const safeQty = Math.max(0, toNumber(qty));
  const lineTotalOriginal = safeUnitPrice * safeQty;

  const minQtyThreshold = Math.max(1, toNumber(minQty, 1));
  const startDate = toOptionalDate(startAt);
  const endDate = toOptionalDate(endAt);
  const currentDate = toOptionalDate(now) || new Date();

  const isWithinStart = startDate ? currentDate >= startDate : true;
  const isWithinEnd = endDate ? currentDate <= endDate : true;
  const withinWindow = isWithinStart && isWithinEnd;

  if (!discountEnabled || safeQty <= 0 || safeQty < minQtyThreshold || !withinWindow) {
    return {
      discountPerUnit: 0,
      unitPriceNet: roundCurrency(safeUnitPrice),
      lineDiscountTotal: 0,
      lineTotalNet: roundCurrency(lineTotalOriginal),
    };
  }

  const normalizedType = String(discountType || "")
    .trim()
    .toUpperCase();
  const rawDiscountValue = Math.max(0, toNumber(discountValue));

  let discountPerUnitRaw = 0;
  if (normalizedType === "PERCENT") {
    discountPerUnitRaw = safeUnitPrice * (rawDiscountValue / 100);
  } else if (normalizedType === "AMOUNT") {
    discountPerUnitRaw = rawDiscountValue;
  }

  discountPerUnitRaw = clamp(discountPerUnitRaw, 0, safeUnitPrice);

  let lineDiscountRaw = discountPerUnitRaw * safeQty;
  const hasCap = cap !== undefined && cap !== null && cap !== "";
  const capValue = hasCap ? Math.max(0, toNumber(cap)) : null;
  if (capValue !== null) {
    lineDiscountRaw = Math.min(lineDiscountRaw, capValue);
  }

  lineDiscountRaw = clamp(lineDiscountRaw, 0, lineTotalOriginal);

  const lineTotalNetRaw = Math.max(0, lineTotalOriginal - lineDiscountRaw);
  const unitPriceNetRaw = safeQty > 0 ? lineTotalNetRaw / safeQty : safeUnitPrice;
  const normalizedDiscountPerUnitRaw = clamp(
    safeUnitPrice - unitPriceNetRaw,
    0,
    safeUnitPrice
  );

  const roundedLineTotalOriginal = roundCurrency(lineTotalOriginal);
  const roundedLineTotalNet = roundCurrency(lineTotalNetRaw);
  const roundedLineDiscount = roundCurrency(
    Math.max(0, roundedLineTotalOriginal - roundedLineTotalNet)
  );

  return {
    discountPerUnit: roundCurrency(normalizedDiscountPerUnitRaw),
    unitPriceNet: roundCurrency(Math.max(0, unitPriceNetRaw)),
    lineDiscountTotal: roundedLineDiscount,
    lineTotalNet: roundedLineTotalNet,
  };
};

export const normalizeItemDiscountType = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "PERCENT" || normalized === "AMOUNT") {
    return normalized;
  }
  return null;
};

export const roundMoney = roundCurrency;
