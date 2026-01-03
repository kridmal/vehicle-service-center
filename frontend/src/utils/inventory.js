import { readJson, writeJson } from "./cache.js";

const INVENTORY_KEY = "ksc_inventory";

const normalize = (value) => String(value ?? "").trim().toLowerCase();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getInventory = () => {
  return readJson(INVENTORY_KEY, []);
};

export const saveInventory = (items) => {
  writeJson(INVENTORY_KEY, items);
};

export const matchInventoryItem = (partItem, inventory) => {
  const key = normalize(partItem.name);
  return inventory.find((item) => {
    if (normalize(item.id) === key) return true;
    return normalize(item.name) === key;
  });
};

export const tryDeductInventory = (partItems, inventory) => {
  const updated = inventory.map((item) => ({ ...item }));

  for (const part of partItems) {
    const qty = toNumber(part.qty);
    if (qty <= 0) continue;

    const target = matchInventoryItem(part, updated);
    if (!target) {
      return {
        ok: false,
        message: `Missing inventory item for "${part.name || "Unnamed part"}".`,
      };
    }

    if (toNumber(target.quantity) < qty) {
      return {
        ok: false,
        message: `Insufficient stock for "${target.name}".`,
      };
    }

    target.quantity = toNumber(target.quantity) - qty;
  }

  return { ok: true, updated };
};
