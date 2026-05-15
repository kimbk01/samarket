"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchStoreProductPublicDeduped } from "@/lib/stores/store-delivery-api-client";
import type { SheetPublicProduct, SheetPublicStore } from "@/lib/stores/map-list-row-to-sheet-product";
import {
  dibayPerfOnOptionDetailFetchDone,
  dibayPerfOnOptionDetailFetchStart,
} from "@/lib/dibay/delivery-flow-perf";
import { deliveryTraceSheetHydrateMs } from "@/lib/dibay/delivery-render-trace";

export type ProductSheetDetailPhase = "idle" | "loading" | "ok" | "error";

type PublicProduct = SheetPublicProduct;
type PublicStore = SheetPublicStore;

function normalizeStoreSlugSegment(raw: string): string {
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* already decoded */
  }
  return s.normalize("NFC").trim();
}

function storeSlugsMatch(urlSlug: string, apiSlug: string): boolean {
  const a = normalizeStoreSlugSegment(urlSlug);
  const b = normalizeStoreSlugSegment(apiSlug);
  if (a === b) return true;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * 단건 상품 API fetch — seed 병합·표시는 호출부에서 동기 useMemo 로 처리.
 */
export function useStoreProductSheetDetail(opts: {
  productId: string | null;
  pageStoreSlug: string;
  hasSeed: boolean;
  retryTick: number;
  perfStoreId?: string;
  onRetryIncrement: () => void;
}): {
  apiProduct: PublicProduct | null;
  apiStore: PublicStore | null;
  phase: ProductSheetDetailPhase;
  notFound: boolean;
  slugBlocked: boolean;
  retry: () => void;
} {
  const [apiProduct, setApiProduct] = useState<PublicProduct | null>(null);
  const [apiStore, setApiStore] = useState<PublicStore | null>(null);
  const [phase, setPhase] = useState<ProductSheetDetailPhase>("idle");
  const [notFound, setNotFound] = useState(false);
  const [slugBlocked, setSlugBlocked] = useState(false);

  const retry = useCallback(() => {
    opts.onRetryIncrement();
  }, [opts.onRetryIncrement]);

  useEffect(() => {
    if (!opts.productId) {
      setApiProduct(null);
      setApiStore(null);
      setPhase("idle");
      setNotFound(false);
      setSlugBlocked(false);
      return;
    }

    const pid = opts.productId;
    setPhase("loading");
    setSlugBlocked(false);
    setApiProduct(null);
    setApiStore(null);
    setNotFound(false);

    let cancelled = false;

    const startMark = dibayPerfOnOptionDetailFetchStart({
      storeId: opts.perfStoreId,
      productId: pid,
    });

    void (async () => {
      try {
        const { json } = await fetchStoreProductPublicDeduped(pid);
        const pj = json as { ok?: boolean; product?: PublicProduct; store?: PublicStore };

        if (!pj?.ok || !pj.product || !pj.store) {
          if (!cancelled) {
            if (!opts.hasSeed) {
              setNotFound(true);
            }
            setPhase("error");
          }
          return;
        }
        const apiSlug = String(pj.store.slug ?? "");
        if (!storeSlugsMatch(opts.pageStoreSlug, apiSlug)) {
          if (!cancelled) {
            setSlugBlocked(true);
            setNotFound(true);
            setPhase("error");
          }
          return;
        }
        if (!cancelled) {
          setApiProduct(pj.product);
          setApiStore(pj.store);
          setNotFound(false);
          setPhase("ok");
          deliveryTraceSheetHydrateMs(pid, Math.max(0, performance.now() - startMark));
        }
      } catch {
        if (!cancelled) {
          if (!opts.hasSeed) {
            setNotFound(true);
          }
          setPhase("error");
        }
      } finally {
        dibayPerfOnOptionDetailFetchDone({
          storeId: opts.perfStoreId,
          productId: pid,
          startMark,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opts.productId, opts.pageStoreSlug, opts.hasSeed, opts.retryTick, opts.perfStoreId]);

  return {
    apiProduct,
    apiStore,
    phase,
    notFound,
    slugBlocked,
    retry,
  };
}
