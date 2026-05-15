"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { StoreCartOtherStoreConflictDialog } from "@/components/stores/StoreCartOtherStoreConflictDialog";
import { useStoreCommerceCartActionsOptional } from "@/contexts/StoreCommerceCartContext";
import {
  dibayPerfRecordAddToCartClick,
  dibayPerfRecordCartReplaceConfirm,
  dibayPerfRecordCartReplaceDone,
} from "@/lib/dibay/delivery-flow-perf";
import { traceDeliveryCartConflictOpenMs } from "@/lib/dibay/delivery-cart-trace";
import {
  closeStoreCartConflict,
  getStoreCartConflictOpenMark,
  useStoreCartConflictUIStore,
} from "@/lib/stores/store-cart-conflict-ui-store";
import { showStoreDetailToast } from "@/lib/stores/store-detail-toast-ui-store";

/**
 * 다른 매장 장바구니 충돌 — `StoreDetailPublic` / option sheet 밖 portal.
 */
export function StoreCartConflictPortal() {
  const open = useStoreCartConflictUIStore((s) => s.open);
  const pendingLine = useStoreCartConflictUIStore((s) => s.pendingLine);
  const onResolved = useStoreCartConflictUIStore((s) => s.onResolved);
  const commerceCart = useStoreCommerceCartActionsOptional();
  const loggedRef = useRef(false);

  useLayoutEffect(() => {
    if (!open || !pendingLine) {
      loggedRef.current = false;
      return;
    }
    if (loggedRef.current) return;
    loggedRef.current = true;
    const ms =
      typeof performance !== "undefined"
        ? performance.now() - getStoreCartConflictOpenMark()
        : 0;
    traceDeliveryCartConflictOpenMs(ms, {
      store_id: pendingLine.storeId,
      next_store_id: pendingLine.storeId,
    });
  }, [open, pendingLine]);

  const root = typeof document !== "undefined" ? document.body : null;
  if (!open || !pendingLine || !root) return null;

  return createPortal(
    <StoreCartOtherStoreConflictDialog
      open
      onCancel={closeStoreCartConflict}
      onClearAndAdd={() => {
        if (!commerceCart) return;
        const line = pendingLine;
        dibayPerfRecordCartReplaceConfirm({ storeId: line.storeId });
        dibayPerfRecordAddToCartClick(line.storeId);
        const r = commerceCart.replaceWithLine(line);
        dibayPerfRecordCartReplaceDone({ storeId: line.storeId });
        closeStoreCartConflict();
        if (!r.ok) return;
        showStoreDetailToast(line.storeId, `${line.title} 담았어요`);
        onResolved?.();
      }}
    />,
    root
  );
}
