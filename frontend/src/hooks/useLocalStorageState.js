import { useEffect, useState } from "react";
import { CACHE_EVENT_NAME, readJson, writeJson } from "../utils/cache.js";

export function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => readJson(key, initialValue));

  useEffect(() => {
    writeJson(key, value);
  }, [key, value]);

  useEffect(() => {
    const handleCacheUpdate = (event) => {
      if (event?.detail?.key !== key) return;
      setValue(event.detail.value ?? readJson(key, initialValue));
    };
    window.addEventListener(CACHE_EVENT_NAME, handleCacheUpdate);
    return () => window.removeEventListener(CACHE_EVENT_NAME, handleCacheUpdate);
  }, [initialValue, key]);

  return [value, setValue];
}
