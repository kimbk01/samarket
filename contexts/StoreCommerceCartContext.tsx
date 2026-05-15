"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AddStoreCartLineInput,
  StoreCartAddResult,
  StoreCommerceCartBucket,
  StoreCommerceCartLine,
  StoreCommerceCartSnapshotV1,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";
import {
  computeStoreCartAddOrMerge,
  emptyCommerceCartV2,
} from "@/lib/stores/store-commerce-cart-add-merge";
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
} from "@/lib/stores/store-commerce-cart-line-mutate";

const STORAGE_KEY = "kasama_store_commerce_cart_v1";

function normalizeCommerceLineFlags(l: StoreCommerceCartLine): StoreCommerceCartLine {
  return {
    ...l,
    pickupAvailable: l.pickupAvailable !== false,
    localDeliveryAvailable: l.localDeliveryAvailable !== false,
    shippingAvailable: l.shippingAvailable !== false,
  };
}

function normalizeSnapshotV2(s: StoreCommerceCartSnapshotV2): StoreCommerceCartSnapshotV2 {
  const carts: Record<string, StoreCommerceCartBucket> = {};
  for (const [k, b] of Object.entries(s.carts)) {
    carts[k] = {
      ...b,
      lines: (b.lines ?? []).map((ln) => normalizeCommerceLineFlags(ln)),
    };
  }
  return { v: 2, carts };
}

function migrateToV2(raw: unknown): StoreCommerceCartSnapshotV2 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v === 2 && o.carts != null && typeof o.carts === "object" && !Array.isArray(o.carts)) {
    return normalizeSnapshotV2(o as StoreCommerceCartSnapshotV2);
  }
  if (o.v === 1) {
    const v1 = raw as StoreCommerceCartSnapshotV1;
    if (typeof v1.storeId !== "string" || !Array.isArray(v1.lines)) return null;
    if (v1.lines.length === 0) return emptyCommerceCartV2();
    return normalizeSnapshotV2({
      v: 2,
      carts: {
        [v1.storeId]: {
          storeId: v1.storeId,
          storeSlug: v1.storeSlug,
          storeName: v1.storeName,
          lines: v1.lines,
        },
      },
    });
  }
  return null;
}

function readSnapshot(): StoreCommerceCartSnapshotV2 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrateToV2(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeSnapshot(s: StoreCommerceCartSnapshotV2 | null) {
  if (typeof window === "undefined") return;
  try {
    if (!s || Object.keys(s.carts).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

export type { AddStoreCartLineInput, StoreCartAddResult } from "@/lib/stores/store-commerce-cart-types";

export type StoreCartBucketSummary = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  /** 담긴 상품 종류 수(줄 개수). 같은 상품을 10개 담아도 1, 서로 다른 줄이 2개면 2 */
  itemCount: number;
  subtotalPhp: number;
};

type Ctx = {
  hydrated: boolean;
  snapshot: StoreCommerceCartSnapshotV2 | null;
  getLinesForStoreId: (storeId: string) => StoreCommerceCartLine[];
  getSubtotalForStoreId: (storeId: string) => number;
  /** 이 매장 장바구니의 상품 종류 수(줄 개수), 총 수량 합이 아님 */
  getItemCountForStoreId: (storeId: string) => number;
  /** 이 매장 장바구니 줄별 수량 합(예: 2종 × 각 수량) */
  getTotalQtyForStoreId: (storeId: string) => number;
  listCartBuckets: () => StoreCartBucketSummary[];
  /** 전 매장 합산 상품 종류 수(줄 수 합), 총 개수 합이 아님 */
  totalItemCountAllStores: number;
  /** 이 매장 외에 담긴 버킷 (안내·허브용) */
  otherBucketsExcluding: (storeId: string) => StoreCartBucketSummary[];
  addOrMergeLine: (input: AddStoreCartLineInput) => StoreCartAddResult;
  /** 전체 비운 뒤 한 줄만 담기 — 다른 매장 교체 확인 후 호출 */
  replaceWithLine: (input: AddStoreCartLineInput) => StoreCartAddResult;
  updateLineQuantity: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clearStoreCart: (storeId: string) => void;
  clearAllCarts: () => void;
  /** API에서 받은 최신 slug·이름으로 버킷 메타만 갱신(옛 slug 링크 보정) */
  patchBucketMeta: (
    storeId: string,
    patch: { storeSlug?: string; storeName?: string }
  ) => void;
};

/** localStorage 등에서 qty가 문자열로 들어와도 합산·병합이 깨지지 않게 */
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

/** Record 키와 bucket.storeId가 어긋난 예전 데이터도 동일 매장으로 집계 */
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

  useEffect(() => {
    setSnapshot(readSnapshot());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSnapshot(snapshot);
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
      publishCommerceCartSnapshot(hydrated, next);
      const sid = storeId?.trim();
      if (!sid) return;
      publishDeliveryCartPatch(sid);
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
    [hydrated]
  );

  const addOrMergeLine = useCallback((input: AddStoreCartLineInput): StoreCartAddResult => {
    const patchT0 = markDeliveryCartPatchAnchor();
    let result!: StoreCartAddResult;
    let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
    setSnapshot((prev) => {
      const base = prev ?? emptyCommerceCartV2();
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

  const updateLineQuantity = useCallback(
    (lineId: string, qty: number) => {
      const patchT0 = markDeliveryCartPatchAnchor();
      let nextSnap: StoreCommerceCartSnapshotV2 | null = null;
      let storeId: string | null = null;
      let deleted = false;
      let nextQty = Math.floor(qty);
      setSnapshot((prev) => {
        const out = mutateCartLineQuantity(prev, lineId, qty);
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
        const out = mutateCartRemoveLine(prev, lineId);
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
        nextSnap = Object.keys(carts).length === 0 ? null : { v: 2, carts };
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
        return { v: 2, carts };
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
      updateLineQuantity,
      removeLine,
      clearStoreCart,
      clearAllCarts,
      patchBucketMeta,
    }),
    [
      addOrMergeLine,
      replaceWithLine,
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

/** snapshot 구독 없음 — detail·menu quick-add 등 cart patch 시 상위 re-render 방지 */
export function useStoreCommerceCartActionsOptional(): StoreCommerceCartActions | null {
  return useContext(StoreCommerceCartActionsCtx);
}
