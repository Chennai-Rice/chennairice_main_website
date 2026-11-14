import { useCallback, useEffect, useState } from "react";

/**
 * The customer's delivery PIN code, typed once on a product page, the cart or checkout and remembered on
 * this device, so the delivery charge can be shown everywhere before checkout (and checkout starts with it).
 */
const KEY = "cr.deliveryPin";
const EVENT = "cr-delivery-pin";
export const PIN_PATTERN = /^[1-9]\d{5}$/;

function read() {
  try {
    const v = window.localStorage.getItem(KEY) || "";
    return PIN_PATTERN.test(v) ? v : "";
  } catch {
    return "";
  }
}

/** Remember a complete PIN code (anything else is ignored), and tell the other users of the hook. */
export function saveDeliveryPin(pin) {
  const v = String(pin || "").trim();
  if (!PIN_PATTERN.test(v)) return;
  try {
    if (window.localStorage.getItem(KEY) === v) return;
    window.localStorage.setItem(KEY, v);
  } catch {
    /* private window: kept for this page only */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

export default function useDeliveryPin() {
  const [pin, setPin] = useState(read);
  useEffect(() => {
    const onChange = (e) => setPin(e.detail || read());
    const onStorage = (e) => { if (e.key === KEY) setPin(read()); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const save = useCallback((v) => { saveDeliveryPin(v); if (PIN_PATTERN.test(String(v || "").trim())) setPin(String(v).trim()); }, []);
  return [pin, save];
}
