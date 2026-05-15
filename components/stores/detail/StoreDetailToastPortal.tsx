"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { StoreDetailToast } from "@/components/stores/detail/StoreDetailToast";
import {
  getStoreDetailToastOpenMark,
  hideStoreDetailToast,
  useStoreDetailToastUIStore,
} from "@/lib/stores/store-detail-toast-ui-store";
import { deliveryRenderTraceBump, deliveryTraceToastOpenMs } from "@/lib/dibay/delivery-render-trace";

const TOAST_AUTO_MS = 2400;

/**
 * toast state — `StoreDetailPublic` 밖 portal.
 */
export function StoreDetailToastPortal() {
  const message = useStoreDetailToastUIStore((s) => s.message);
  const storeId = useStoreDetailToastUIStore((s) => s.storeId);
  const loggedRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    deliveryRenderTraceBump("toast-portal");
  });

  useLayoutEffect(() => {
    if (!message || !storeId) {
      loggedRef.current = null;
      return;
    }
    const key = `${storeId}::${message}`;
    if (loggedRef.current === key) return;
    loggedRef.current = key;
    const t0 = getStoreDetailToastOpenMark();
    deliveryTraceToastOpenMs(storeId, typeof performance !== "undefined" ? performance.now() - t0 : 0);
  }, [message, storeId]);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => hideStoreDetailToast(), TOAST_AUTO_MS);
    return () => window.clearTimeout(id);
  }, [message]);

  const root = typeof document !== "undefined" ? document.body : null;
  if (!message || !storeId || !root) return null;

  return createPortal(<StoreDetailToast storeId={storeId} message={message} />, root);
}
