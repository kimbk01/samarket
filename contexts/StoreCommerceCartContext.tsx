"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AddStoreCartLineInput,
  StoreCartAddResult,
  StoreCommerceCartBucket,
  StoreCommerceCartLine,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";
import {
  computeStoreCartAddOrMerge,
  emptyCommerceCartV2,
} from "@/lib/stores/store-commerce-cart-add-merge";
import {
  sanitizeCommerceCartSnapshot,
  touchCommerceCartSnapshot,
} from "@/lib/stores/store-commerce-cart-expiry";
import { bindCommerceCartResync } from "@/lib/stores/store-commerce-cart-resync";
import {
  readCommerceCartFromStorage,
  writeCommerceCartToStorage,
} from "@/lib/stores/store-commerce-cart-storage";
import { traceCommerceCart } from "@/lib/stores/store-commerce-cart-trace";
import {
  shouldApplyExternalCommerceCartSnapshot,
  snapshotGeneration,
} from "@/lib/stores/store-commerce-cart-sync-guard";
import { STORE_CART_EXPIRED_TOAST } from "@/lib/stores/store-cart-policy";
import { showCommerceCartPolicyToast } from "@/lib/stores/store-detail-toast-ui-store";
import { publishCommerceCartSnapshot } from "@/lib/stores/store-commerce-cart-snapshot-bus";
import { publishDeliveryCartPatch } from "@/lib/dibay/delivery-cart-patch-bus";
import {
  traceDeliveryCartDeleteMs,
  traceDeliveryCartOptimisticMs,
  traceDeliveryCartQtyPatchMs,
} from "@/lib/dibay/delivery-cart-trace";
import {
  DELIVERY_PERF_TAG_CART_PATCH,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { markDeliveryCartPatchAnchor } from "@/lib/dibay/delivery-render-trace";
import {
  mutateCartLineQuantity,
  mutateCartRemoveLine,
  mutateCartReplaceLineAt,
} from "@/lib/stores/store-commerce-cart-line-mutate";

function prepareSnapshotForWrite(
  s: StoreCommerceCartSnapshotV2 | null
): StoreCommerceCartSnapshotV2 | null {
  if (!s) return null;
  const { snapshot, expired } = sanitizeCommerceCartSnapshot(s);
  if (expired) {
    showCommerceCartPolicyToast(STORE_CART_EXPIRED_TOAST);
    return null;
  }
  return snapshot;
}

export type { AddStoreCartLineInput, StoreCartAddResult } from "@/lib/stores/store-commerce-cart-types";

export type StoreCartBucketSummary = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  itemCount: number;
  subtotalPhp: number;
};

type Ctx = {
  hydrated: boolean;
  snapshot: StoreCommerceCartSnapshotV2 | null;
  getLinesForStoreId: (storeId: string) => StoreCommerceCartLine[];
  getSubtotalForStoreId: (storeId: string) => number;
  getItemCountForStoreId: (storeId: string) => number;
  getTotalQtyForStoreId: (storeId: string) => number;
  listCartBuckets: () => StoreCartBucketSummary[];
  totalItemCountAllStores: number;
  otherBucketsExcluding: (storeId: string) => StoreCartBucketSummary[];
  addOrMergeLine: (input: AddStoreCartLineInput) => StoreCartAddResult;
  replaceWithLine: (input: AddStoreCartLineInput) => StoreCartAddResult;
  replaceCartLineAt: (lineId: string, input: AddStoreCartLineInput) => StoreCartAddResult;
  updateLineQuantity: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clearStoreCart: (storeId: string) => void;
  clearAllCarts: () => void;
  patchBucketMeta: (
    storeId: string,
    patch: { storeSlug?: string; storeName?: string }
  ) => void;
};

function lineQtyNumber(l: StoreCommerceCartLine): number {
  const x = Math.floor(Number(l.qty));
  return Number.isFinite(x) && x > 0 ? x : 0;
}

function bucketStats(b: StoreCommerceCartBucket): Pick<StoreCartBucketSummary, "itemCount" | "subtotalPhp"> {
  const itemCount = b.lines.filter((l) => lineQtyNumber(l) > 0).length;
  const subtotalPhp = b.lines.reduce(
    (n, l) => n + Math.max(0, Number(l.unitPricePhp) || 0) * lineQtyNumber(l),
    0
  );
  return { itemCount, subtotalPhp };
}

function normalizeStoreIdKey(id: string | undefined | null): string {
  return String(id ?? "").trim();
}

function bucketsMatchingStoreId(
  snap: StoreCommerceCartSnapshotV2 | null,
  storeId: string
): StoreCommerceCartBucket[] {
  if (!snap?.carts) return [];
  const tid = normalizeStoreIdKey(storeId);
  if (!tid) return [];
  return Object.values(snap.carts).filter((b) => normalizeStoreIdKey(b.storeId) === tid);
}

export type StoreCommerceCartActions = Pick<
  Ctx,
  | "addOrMergeLine"
  | "replaceWithLine"
  | "replaceCartLineAt"
  | "updateLineQuantity"
  | "removeLine"
  | "clearStoreCart"
  | "clearAllCarts"
  | "patchBucketMeta"
>;

const StoreCommerceCartCtx = createContext<Ctx | null>(null);
const StoreCommerceCartActionsCtx = createContext<StoreCommerceCartActions | null>(null);

export function StoreCommerceCartProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState<StoreCommerceCartSnapshotV2 | null>(null);
  const snapshotRef = useRef<StoreCommerceCartSnapshotV2 | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const applyExternalSnapshot = useCallback((incoming: StoreCommerceCartSnapshotV2 | null) => {
    setSnapshot((current) => {
      if (!shouldApplyExternalCommerceCartSnapshot(current, incoming)) {
        traceCommerceCart("apply_reject_stale", {
          current_gen: snapshotGeneration(current),
          incoming_gen: snapshotGeneration(incoming),
        });
        return current;
      }
      return incoming;
    });
  }, []);

  useEffect(() => {
    const loaded = readCommerceCartFromStorage();
    if (loaded.expired) {
      showCommerceCartPolicyToast(STORE_CART_EXPIRED_TOAST);
    }
    setSnapshot(loaded.snapshot);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    return bindCommerceCartResync({
      getCurrent: () => snapshotRef.current,
      apply: applyExternalSnapshot,
      onExpired: () => showCommerceCartPolicyToast(STORE_CART_EXPIRED_TOAST),
    });
  }, [hydrated, applyExternalSnapshot]);

  useEffect(() => {
    if (!hydrated) return;
    writeCommerceCartToStorage(snapshot);
  }, [hydrated, snapshot]);

  useEffect(() => {
    publishCommerceCartSnapshot(hydrated, snapshot);
  }, [hydrated, snapshot]);

  const flushCartSnapshot = useCallback(
    (
      next: StoreCommerceCartSnapshotV2 | null,
      storeId: string | null,
      patchT0: number,
      trace:
        | { kind: "optimistic"; productId?: string }
        | { kind: "qty"; lineId: string; qty: number }
        | { kind: "delete"; lineId: string }
        | null
    ) => {
      const sid = storeId?.trim();
      if (!sid) return;
      publishDeliveryCartPatch(sid, next?.generation);
      const patchMs =
        typeof performance !== "undefined" ? performance.now() - patchT0 : Date.now() - patchT0;
      if (!trace) return;
      if (trace.kind === "optimistic") {
        traceDeliveryCartOptimisticMs(patchMs, {
          store_id: sid,
          product_id: trace.productId,
        });
        deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PATCH, {
          event: "optimistic_cart_patch",
          store_id: sid,
          product_id: trace.productId,
          patch_ms: Math.round(patchMs),
        });
        return;
      }
      if (trace.kind === "qty") {
        traceDeliveryCartQtyPatchMs(patchMs, {
          store_id: sid,
          line_id: trace.lineId,
          qty: trace.qty,
        });
        return;
      }
      traceDeliveryCartDeleteMs(patchMs, {
        store_id: sid,
        line_id: trace.lineId,
      });
    },
    []
  );

  const addOrMergeLine = useCallback((input: AddStoreCartLineInput): StoreCartAddResult => {
    const patchT0 = markDeliveryCartPatchAnchor();
    let result!: StoreCartAddResult;
    let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
    setSnapshot((prev) => {
      const fresh = prepareSnapshotForWrite(prev);
      const base = fresh ?? emptyCommerceCartV2();
      const out = computeStoreCartAddOrMerge(base, input);
      result = out.result;
      nextSnap = out.nextSnapshot;
      return out.nextSnapshot;
    });
    if (result.ok) {
      flushCartSnapshot(nextSnap, input.storeId, patchT0, {
        kind: "optimistic",
        productId: input.productId,
      });
    }
    return result;
  }, [flushCartSnapshot]);

  const replaceWithLine = useCallback((input: AddStoreCartLineInput): StoreCartAddResult => {
    const patchT0 = markDeliveryCartPatchAnchor();
    let result!: StoreCartAddResult;
    let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
    setSnapshot(() => {
      const out = computeStoreCartAddOrMerge(emptyCommerceCartV2(), input);
      result = out.result;
      nextSnap = out.nextSnapshot;
      return out.nextSnapshot;
    });
    if (result.ok) {
      flushCartSnapshot(nextSnap, input.storeId, patchT0, {
        kind: "optimistic",
        productId: input.productId,
      });
    }
    return result;
  }, [flushCartSnapshot]);

  const replaceCartLineAt = useCallback(
    (lineId: string, input: AddStoreCartLineInput): StoreCartAddResult => {
      const patchT0 = markDeliveryCartPatchAnchor();
      let ok = false;
      let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
      let storeId: string | null = null;
      setSnapshot((prev) => {
        const out = mutateCartReplaceLineAt(prepareSnapshotForWrite(prev), lineId, input);
        ok = out.ok;
        nextSnap = out.next;
        storeId = out.storeId;
        return out.next;
      });
      if (ok && nextSnap && storeId) {
        flushCartSnapshot(nextSnap, storeId, patchT0, {
          kind: "optimistic",
          productId: input.productId,
        });
        return { ok: true, reason: "added" };
      }
      return { ok: false, reason: "invalid_option" };
    },
    [flushCartSnapshot]
  );

  const updateLineQuantity = useCallback(
    (lineId: string, qty: number) => {
      const patchT0 = markDeliveryCartPatchAnchor();
      let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
      let storeId: string | null = null;
      let deleted = false;
      let nextQty = Math.floor(qty);
      setSnapshot((prev) => {
        const out = mutateCartLineQuantity(prepareSnapshotForWrite(prev), lineId, qty);
        nextSnap = out.next;
        storeId = out.storeId;
        deleted = out.deleted;
        if (!out.deleted && out.next) {
          for (const bucket of Object.values(out.next.carts)) {
            const line = bucket.lines.find((l) => l.lineId === lineId);
            if (line) {
              nextQty = Math.floor(Number(line.qty) || 0);
              break;
            }
          }
        }
        return out.next;
      });
      flushCartSnapshot(
        nextSnap,
        storeId,
        patchT0,
        storeId
          ? deleted
            ? { kind: "delete", lineId }
            : { kind: "qty", lineId, qty: nextQty }
          : null
      );
    },
    [flushCartSnapshot]
  );

  const removeLine = useCallback(
    (lineId: string) => {
      const patchT0 = markDeliveryCartPatchAnchor();
      let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
      let storeId: string | null = null;
      setSnapshot((prev) => {
        const out = mutateCartRemoveLine(prepareSnapshotForWrite(prev), lineId);
        nextSnap = out.next;
        storeId = out.storeId;
        return out.next;
      });
      flushCartSnapshot(nextSnap, storeId, patchT0, storeId ? { kind: "delete", lineId } : null);
    },
    [flushCartSnapshot]
  );

  const clearStoreCart = useCallback(
    (storeId: string) => {
      const patchT0 = markDeliveryCartPatchAnchor();
      let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
      setSnapshot((prev) => {
        if (!prev) return prev;
        const tid = normalizeStoreIdKey(storeId);
        const carts = { ...prev.carts };
        for (const k of Object.keys(carts)) {
          if (normalizeStoreIdKey(carts[k]?.storeId) === tid) delete carts[k];
        }
        nextSnap =
          Object.keys(carts).length === 0
            ? null
            : touchCommerceCartSnapshot({ v: 2, carts }, storeId);
        return nextSnap;
      });
      flushCartSnapshot(nextSnap, storeId, patchT0, null);
    },
    [flushCartSnapshot]
  );

  const clearAllCarts = useCallback(() => setSnapshot(null), []);

  const patchBucketMeta = useCallback(
    (storeId: string, patch: { storeSlug?: string; storeName?: string }) => {
      const tid = normalizeStoreIdKey(storeId);
      if (!tid) return;
      setSnapshot((prev) => {
        if (!prev) return prev;
        let changed = false;
        const carts = { ...prev.carts };
        for (const k of Object.keys(carts)) {
          const b = carts[k];
          if (!b || normalizeStoreIdKey(b.storeId) !== tid) continue;
          const nextSlug =
            patch.storeSlug != null && patch.storeSlug.trim() !== ""
              ? patch.storeSlug.trim()
              : b.storeSlug;
          const nextName =
            patch.storeName != null && patch.storeName.trim() !== ""
              ? patch.storeName.trim()
              : b.storeName;
          if (nextSlug === b.storeSlug && nextName === b.storeName) continue;
          carts[k] = { ...b, storeSlug: nextSlug, storeName: nextName };
          changed = true;
        }
        if (!changed) return prev;
        return touchCommerceCartSnapshot({ v: 2, carts }, storeId);
      });
    },
    []
  );

  const value = useMemo(() => {
    const snap = snapshot ?? null;

    const listCartBuckets = (): StoreCartBucketSummary[] => {
      if (!snap) return [];
      return Object.values(snap.carts).map((b) => ({
        storeId: b.storeId,
        storeSlug: b.storeSlug,
        storeName: b.storeName,
        ...bucketStats(b),
      }));
    };

    const getLinesForStoreId = (storeId: string) =>
      bucketsMatchingStoreId(snap, storeId).flatMap((b) => b.lines);

    const getSubtotalForStoreId = (storeId: string) =>
      bucketsMatchingStoreId(snap, storeId).reduce((n, b) => n + bucketStats(b).subtotalPhp, 0);

    const getItemCountForStoreId = (storeId: string) =>
      bucketsMatchingStoreId(snap, storeId).reduce((n, b) => n + bucketStats(b).itemCount, 0);

    const getTotalQtyForStoreId = (storeId: string) =>
      bucketsMatchingStoreId(snap, storeId).reduce(
        (n, b) => n + b.lines.reduce((m, l) => m + lineQtyNumber(l), 0),
        0
      );

    const allBuckets = listCartBuckets();
    const totalItemCountAllStores = allBuckets.reduce((n, x) => n + x.itemCount, 0);

    const otherBucketsExcluding = (storeId: string) => {
      const tid = normalizeStoreIdKey(storeId);
      return allBuckets.filter(
        (b) => normalizeStoreIdKey(b.storeId) !== tid && b.itemCount > 0
      );
    };

    return {
      hydrated,
      snapshot: snap,
      getLinesForStoreId,
      getSubtotalForStoreId,
      getItemCountForStoreId,
      getTotalQtyForStoreId,
      listCartBuckets,
      totalItemCountAllStores,
      otherBucketsExcluding,
      addOrMergeLine,
      replaceWithLine,
      replaceCartLineAt,
      updateLineQuantity,
      removeLine,
      clearStoreCart,
      clearAllCarts,
      patchBucketMeta,
    };
  }, [
    hydrated,
    snapshot,
    addOrMergeLine,
    replaceWithLine,
    replaceCartLineAt,
    updateLineQuantity,
    removeLine,
    clearStoreCart,
    clearAllCarts,
    patchBucketMeta,
  ]);

  const actionsValue = useMemo<StoreCommerceCartActions>(
    () => ({
      addOrMergeLine,
      replaceWithLine,
      replaceCartLineAt,
      updateLineQuantity,
      removeLine,
      clearStoreCart,
      clearAllCarts,
      patchBucketMeta,
    }),
    [
      addOrMergeLine,
      replaceWithLine,
      replaceCartLineAt,
      updateLineQuantity,
      removeLine,
      clearStoreCart,
      clearAllCarts,
      patchBucketMeta,
    ]
  );

  return (
    <StoreCommerceCartActionsCtx.Provider value={actionsValue}>
      <StoreCommerceCartCtx.Provider value={value}>{children}</StoreCommerceCartCtx.Provider>
    </StoreCommerceCartActionsCtx.Provider>
  );
}

export function useStoreCommerceCart(): Ctx {
  const v = useContext(StoreCommerceCartCtx);
  if (!v) throw new Error("useStoreCommerceCart must be used within StoreCommerceCartProvider");
  return v;
}

export function useStoreCommerceCartOptional(): Ctx | null {
  return useContext(StoreCommerceCartCtx);
}

export function useStoreCommerceCartActionsOptional(): StoreCommerceCartActions | null {
  return useContext(StoreCommerceCartActionsCtx);
}
