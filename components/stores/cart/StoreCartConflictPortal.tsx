"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { StoreCartOtherStoreConflictDialog } from "@/components/stores/StoreCartOtherStoreConflictDialog";
import { useStoreCommerceCartActionsOptional } from "@/contexts/StoreCommerceCartContext";
import {
  dibayPerfRecordAddToCartClick,
  dibayPerfRecordCartReplaceConfirm,
  dibayPerfRecordCartReplaceDone,
} from "@/lib/dibay/delivery-flow-perf";
import { dibayPerfOnCartbarUpdated } from "@/lib/dibay/delivery-flow-perf";
import { traceDeliveryCartConflictOpenMs } from "@/lib/dibay/delivery-cart-trace";
import {
  closeStoreCartConflict,
  getStoreCartConflictOpenMark,
  resolveStoreCartBulkClearConfirmed,
  useStoreCartConflictUIStore,
} from "@/lib/stores/store-cart-conflict-ui-store";
import { traceCommerceCart } from "@/lib/stores/store-commerce-cart-trace";
import { showStoreDetailToast } from "@/lib/stores/store-detail-toast-ui-store";
import { useStoreCommerceCartLines } from "@/lib/stores/use-store-commerce-cart-selector";
import type { StoreCartConflictPendingAdd } from "@/components/stores/StoreCartOtherStoreConflictDialog";

/**
 * 다른 매장 장바구니 충돌 — 전 경로 단일 portal (detail / sheet / product / 재주문).
 */
export function StoreCartConflictPortal() {
  const router = useRouter();
  const open = useStoreCartConflictUIStore((s) => s.open);
  const mode = useStoreCartConflictUIStore((s) => s.mode);
  const pendingLine = useStoreCartConflictUIStore((s) => s.pendingLine);
  const existing = useStoreCartConflictUIStore((s) => s.existing);
  const target = useStoreCartConflictUIStore((s) => s.target);
  const onResolved = useStoreCartConflictUIStore((s) => s.onResolved);
  const commerceCart = useStoreCommerceCartActionsOptional();
  const existingLines = useStoreCommerceCartLines(open ? existing?.storeId : null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const loggedRef = useRef(false);

  useLayoutEffect(() => {
    if (!open) {
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
      store_id: existing?.storeId ?? pendingLine?.storeId ?? "bulk",
      next_store_id: target?.storeId ?? pendingLine?.storeId ?? "bulk",
    });
  }, [open, pendingLine, existing, target]);

  const root = typeof document !== "undefined" ? document.body : null;
  if (!open || !root || !existing) return null;

  const existingStoreName = existing.storeName.trim() || "다른 가게";
  const nextStoreName = target?.storeName?.trim() ?? pendingLine?.storeName?.trim() ?? "";

  const pendingAdd: StoreCartConflictPendingAdd | null = pendingLine
    ? {
        title: pendingLine.title,
        optionsSummary: pendingLine.optionsSummary ?? "",
        qty: Math.max(1, Math.floor(Number(pendingLine.qty)) || 1),
        lineTotalPhp:
          Math.max(0, Math.floor(Number(pendingLine.unitPricePhp)) || 0) *
          Math.max(1, Math.floor(Number(pendingLine.qty)) || 1),
      }
    : null;

  const onCancel = () => {
    if (replaceBusy) return;
    closeStoreCartConflict();
  };

  const onViewCart = () => {
    if (replaceBusy) return;
    const slug = existing.storeSlug.trim();
    closeStoreCartConflict();
    if (slug) {
      router.push(`/stores/${encodeURIComponent(slug)}/cart`);
    } else {
      router.push("/stores");
    }
  };

  const onClearAndAdd = () => {
    if (!commerceCart || replaceBusy) return;

    if (mode === "bulk_clear") {
      setReplaceBusy(true);
      traceCommerceCart("replace_bulk_start", {});
      dibayPerfRecordCartReplaceConfirm({ storeId: existing.storeId });
      commerceCart.clearAllCarts();
      dibayPerfRecordCartReplaceDone({ storeId: existing.storeId });
      traceCommerceCart("replace_bulk_end", {});
      const nextStoreId = target?.storeId?.trim();
      if (nextStoreId) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => dibayPerfOnCartbarUpdated(nextStoreId));
        });
      }
      setReplaceBusy(false);
      resolveStoreCartBulkClearConfirmed();
      return;
    }

    const line = pendingLine;
    if (!line) return;
    setReplaceBusy(true);
    traceCommerceCart("replace_line_start", {
      store_id: line.storeId,
      product_id: line.productId,
    });
    dibayPerfRecordCartReplaceConfirm({ storeId: line.storeId });
    dibayPerfRecordAddToCartClick(line.storeId);
    const r = commerceCart.replaceWithLine(line);
    dibayPerfRecordCartReplaceDone({ storeId: line.storeId });
    setReplaceBusy(false);
    closeStoreCartConflict();
    traceCommerceCart("replace_line_end", {
      store_id: line.storeId,
      ok: r.ok,
    });
    if (!r.ok) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => dibayPerfOnCartbarUpdated(line.storeId));
    });
    showStoreDetailToast(line.storeId, `${line.title} 담았어요`);
    onResolved?.();
  };

  return createPortal(
    <StoreCartOtherStoreConflictDialog
      open
      replaceBusy={replaceBusy}
      existingStoreName={existingStoreName}
      nextStoreName={nextStoreName}
      existingItemCount={existing.itemCount}
      existingSubtotalPhp={existing.subtotalPhp}
      existingLines={existingLines}
      pendingAdd={pendingAdd}
      onViewCart={onViewCart}
      onCancel={onCancel}
      onClearAndAdd={onClearAndAdd}
    />,
    root
  );
}
