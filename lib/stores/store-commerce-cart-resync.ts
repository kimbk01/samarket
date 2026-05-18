import {
  commerceCartStorageStorageKey,
  isCommerceCartStorageSyncSuppressed,
  readCommerceCartFromStorage,
} from "@/lib/stores/store-commerce-cart-storage";
import { traceCommerceCart } from "@/lib/stores/store-commerce-cart-trace";
import {
  shouldApplyExternalCommerceCartSnapshot,
  snapshotGeneration,
} from "@/lib/stores/store-commerce-cart-sync-guard";
import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

export type CommerceCartResyncHandlers = {
  getCurrent: () => StoreCommerceCartSnapshotV2 | null;
  apply: (snapshot: StoreCommerceCartSnapshotV2 | null) => void;
  onExpired: () => void;
};

function resyncFromStorage(handlers: CommerceCartResyncHandlers, reason: string): void {
  const loaded = readCommerceCartFromStorage();
  if (loaded.expired) {
    traceCommerceCart("resync_expired", { reason });
    handlers.onExpired();
    if (handlers.getCurrent() !== null) {
      handlers.apply(null);
    }
    return;
  }
  const incoming = loaded.snapshot;
  const current = handlers.getCurrent();
  if (!shouldApplyExternalCommerceCartSnapshot(current, incoming)) {
    traceCommerceCart("resync_reject_stale", {
      reason,
      current_gen: snapshotGeneration(current),
      incoming_gen: snapshotGeneration(incoming),
    });
    return;
  }
  traceCommerceCart("resync_apply", {
    reason,
    generation: snapshotGeneration(incoming),
  });
  handlers.apply(incoming);
}

/**
 * multi-tab storage · visibility · focus · BFCache · online 복구 시 cart resync.
 */
export function bindCommerceCartResync(handlers: CommerceCartResyncHandlers): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key != null && e.key !== commerceCartStorageStorageKey()) return;
    if (isCommerceCartStorageSyncSuppressed()) return;
    resyncFromStorage(handlers, "storage");
  };

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    resyncFromStorage(handlers, "visibility");
  };

  const onFocus = () => {
    resyncFromStorage(handlers, "focus");
  };

  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    resyncFromStorage(handlers, "bfcache");
  };

  const onOnline = () => {
    resyncFromStorage(handlers, "online");
  };

  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);

  return () => {
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", onOnline);
  };
}
