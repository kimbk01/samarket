"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logBrowseCardHydration } from "@/lib/stores/browse-featured-items-perf-log";
import {
  fetchBrowseFeaturedItemsBatch,
  peekBrowseFeaturedItemsClient,
} from "@/lib/stores/fetch-browse-featured-items-client";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";

export type BrowseFeaturedMenuHydrationPhase = "idle" | "loading" | "done";

type StoreRef = { id: string; slug: string };

const VIEWPORT_ROOT_MARGIN = "200px 0px";
const VIEWPORT_THRESHOLD = 0.01;
const FLUSH_DEBOUNCE_MS = 48;

export function useBrowseFeaturedItemsHydration(
  stores: StoreRef[],
  opts?: { enabled?: boolean }
): {
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  hydrationEpoch: number;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
} {
  const enabled = opts?.enabled !== false;
  const storesKey = stores.map((s) => s.id).join(",");
  const hydratedRef = useRef(new Map<string, BrowseFeaturedCardItem[]>());
  const phaseRef = useRef(new Map<string, BrowseFeaturedMenuHydrationPhase>());
  const visibleRef = useRef(new Set<string>());
  const inflightRef = useRef(new Set<string>());
  const resolvedRef = useRef(new Set<string>());
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchGenRef = useRef(0);
  const [hydrationEpoch, setHydrationEpoch] = useState(0);

  const bumpEpoch = useCallback(() => {
    setHydrationEpoch((n) => n + 1);
  }, []);

  const applyHydrated = useCallback(
    (map: Map<string, BrowseFeaturedCardItem[]>, gen: number) => {
      if (gen !== batchGenRef.current) return;
      let changed = false;
      for (const [id, items] of map) {
        hydratedRef.current.set(id, items);
        phaseRef.current.set(id, "done");
        resolvedRef.current.add(id);
        inflightRef.current.delete(id);
        changed = true;
      }
      if (changed) bumpEpoch();
    },
    [bumpEpoch]
  );

  const flushVisibleBatch = useCallback(() => {
    if (!enabled) return;
    const want: string[] = [];
    let clientHits = 0;
    for (const id of visibleRef.current) {
      if (resolvedRef.current.has(id) || inflightRef.current.has(id)) continue;
      const clientHit = peekBrowseFeaturedItemsClient(id);
      if (clientHit !== undefined) {
        hydratedRef.current.set(id, clientHit);
        phaseRef.current.set(id, "done");
        resolvedRef.current.add(id);
        clientHits += 1;
        continue;
      }
      want.push(id);
      phaseRef.current.set(id, "loading");
      inflightRef.current.add(id);
    }
    if (clientHits > 0) bumpEpoch();
    if (want.length === 0) return;

    bumpEpoch();
    const gen = batchGenRef.current;
    void fetchBrowseFeaturedItemsBatch(want)
      .then(({ byStoreId, cacheHits }) => {
        applyHydrated(byStoreId, gen);
        logBrowseCardHydration({
          visible_cards: visibleRef.current.size,
          hydrated_cards: want.length,
          skipped_cards: Math.max(0, visibleRef.current.size - want.length),
          cache_hits: cacheHits + clientHits,
        });
      })
      .catch(() => {
        if (gen !== batchGenRef.current) return;
        for (const id of want) {
          hydratedRef.current.set(id, []);
          phaseRef.current.set(id, "done");
          resolvedRef.current.add(id);
          inflightRef.current.delete(id);
        }
        bumpEpoch();
      });
  }, [applyHydrated, bumpEpoch, enabled]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushVisibleBatch();
    }, FLUSH_DEBOUNCE_MS);
  }, [flushVisibleBatch]);

  const resetHydrationState = useCallback(() => {
    batchGenRef.current += 1;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const obs = observerRef.current;
    if (obs) {
      for (const el of elementsRef.current.values()) {
        obs.unobserve(el);
      }
    }
    hydratedRef.current.clear();
    phaseRef.current.clear();
    visibleRef.current.clear();
    inflightRef.current.clear();
    resolvedRef.current.clear();
    elementsRef.current.clear();
    bumpEpoch();
  }, [bumpEpoch]);

  useEffect(() => {
    resetHydrationState();
  }, [storesKey, enabled, resetHydrationState]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    observerRef.current?.disconnect();
    const obs = new IntersectionObserver(
      (entries) => {
        let touched = false;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.browseStoreId;
          if (!id) continue;
          if (entry.isIntersecting) {
            if (!visibleRef.current.has(id)) {
              visibleRef.current.add(id);
              touched = true;
            }
            if (
              !resolvedRef.current.has(id) &&
              !inflightRef.current.has(id) &&
              peekBrowseFeaturedItemsClient(id) === undefined &&
              hydratedRef.current.get(id) === undefined
            ) {
              phaseRef.current.set(id, "loading");
              touched = true;
            }
          }
        }
        if (touched) {
          bumpEpoch();
          scheduleFlush();
        }
      },
      { root: null, rootMargin: VIEWPORT_ROOT_MARGIN, threshold: VIEWPORT_THRESHOLD }
    );
    observerRef.current = obs;
    for (const [id, el] of elementsRef.current) {
      el.dataset.browseStoreId = id;
      obs.observe(el);
    }
    return () => {
      obs.disconnect();
      if (observerRef.current === obs) observerRef.current = null;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [bumpEpoch, enabled, scheduleFlush, storesKey]);

  const registerListItem = useCallback((storeId: string, node: HTMLElement | null) => {
    const obs = observerRef.current;
    const prev = elementsRef.current.get(storeId);
    if (prev && obs) obs.unobserve(prev);
    if (!node) {
      elementsRef.current.delete(storeId);
      visibleRef.current.delete(storeId);
      return;
    }
    node.dataset.browseStoreId = storeId;
    elementsRef.current.set(storeId, node);
    obs?.observe(node);
  }, []);

  const getPhase = useCallback((storeId: string): BrowseFeaturedMenuHydrationPhase => {
    return phaseRef.current.get(storeId) ?? "idle";
  }, []);

  return {
    hydratedByStoreId: hydratedRef.current,
    hydrationEpoch,
    getPhase,
    registerListItem,
  };
}
