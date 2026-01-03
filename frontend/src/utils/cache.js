const CACHE_EVENT = "ksc:cache-update";

export const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(CACHE_EVENT, { detail: { key, value } })
    );
  } catch {
    // Ignore if CustomEvent is unavailable.
  }
};

export const CACHE_EVENT_NAME = CACHE_EVENT;
