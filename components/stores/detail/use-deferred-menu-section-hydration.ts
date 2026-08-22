"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";
import {
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_MENU_DEFERRED_HYDRATE,
} from "@/lib/dibay/delivery-perf-trace";
import {
  initialDeferredHydratedThroughIndex,
  MENU_DEFER_HYDRATE_BATCH,
  shouldDeferMenuSectionHydration,
} from "@/lib/dibay/store-menu-viewport-policy";

export function useDeferredMenuSectionHydration(
  sections: MenuSection[],
  forceHydrateThroughIndex: number | null = null
) {
  const sectionsStructureKey = useMemo(
    () => sections.map((s) => `${s.heading}:${s.items.length}`).join("|"),
    [sections]
  );
  const deferEnabled = useMemo(
    () => shouldDeferMenuSectionHydration(sections),
    [sections, sectionsStructureKey]
  );
  const maxIndex = Math.max(0, sections.length - 1);

  const resolveHydratedThrough = useCallback(
    (forced: number | null) => {
      const base = deferEnabled ? initialDeferredHydratedThroughIndex(sections) : maxIndex;
      if (forced == null || forced < 0) return base;
      return Math.max(base, Math.min(maxIndex, forced));
    },
    [deferEnabled, maxIndex, sections]
  );

  const [hydratedThrough, setHydratedThrough] = useState(() =>
    resolveHydratedThrough(forceHydrateThroughIndex)
  );

  const hydratedThroughRef = useRef(hydratedThrough);
  hydratedThroughRef.current = hydratedThrough;
  const deferLoggedRef = useRef(false);

  useEffect(() => {
    if (!deferEnabled) {
      setHydratedThrough(maxIndex);
      return;
    }
    setHydratedThrough(resolveHydratedThrough(forceHydrateThroughIndex));
    deferLoggedRef.current = false;
  }, [deferEnabled, maxIndex, sections, sectionsStructureKey, forceHydrateThroughIndex, resolveHydratedThrough]);

  useEffect(() => {
    if (forceHydrateThroughIndex == null || forceHydrateThroughIndex < 0) return;
    setHydratedThrough((prev) =>
      Math.max(prev, Math.min(maxIndex, forceHydrateThroughIndex))
    );
  }, [forceHydrateThroughIndex, maxIndex]);

  useEffect(() => {
    if (!deferEnabled || deferLoggedRef.current) return;
    deferLoggedRef.current = true;
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_DEFERRED_HYDRATE, {
      event: "defer_enabled",
      section_count: sections.length,
      initial_through: hydratedThroughRef.current,
    });
  }, [deferEnabled, sections.length]);

  const logHydrateBatch = useCallback(
    (through: number, reason: string) => {
      if (!deferEnabled) return;
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_DEFERRED_HYDRATE, {
        event: "hydrate_batch",
        reason,
        hydrated_through: through,
        section_count: sections.length,
      });
    },
    [deferEnabled, sections.length]
  );

  const ensureHydratedThrough = useCallback(
    (index: number, reason: string) => {
      const target = Math.min(maxIndex, Math.max(0, index));
      setHydratedThrough((prev) => {
        if (prev >= target) return prev;
        logHydrateBatch(target, reason);
        return target;
      });
    },
    [logHydrateBatch, maxIndex]
  );

  const hydrateNextBatch = useCallback(
    (reason: string) => {
      if (!deferEnabled) return;
      setHydratedThrough((prev) => {
        const next = Math.min(maxIndex, prev + MENU_DEFER_HYDRATE_BATCH);
        if (next === prev) return prev;
        logHydrateBatch(next, reason);
        return next;
      });
    },
    [deferEnabled, logHydrateBatch, maxIndex]
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!deferEnabled || typeof window === "undefined") return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        let maxNear = hydratedThroughRef.current;
        sections.forEach((_, i) => {
          const el = document.getElementById(`store-sec-${i}`);
          if (!el) return;
          const top = el.getBoundingClientRect().top;
          if (top < window.innerHeight + 520) maxNear = Math.max(maxNear, i);
        });
        if (maxNear > hydratedThroughRef.current) {
          ensureHydratedThrough(maxNear, "scroll_near");
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [deferEnabled, ensureHydratedThrough, sections.length, sectionsStructureKey]);

  useEffect(() => {
    if (!deferEnabled) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        hydrateNextBatch("sentinel_visible");
      },
      { root: null, rootMargin: "480px 0px 720px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [deferEnabled, hydrateNextBatch, hydratedThrough]);

  const isSectionHydrated = useCallback(
    (sectionIndex: number) => !deferEnabled || sectionIndex <= hydratedThrough,
    [deferEnabled, hydratedThrough]
  );

  return {
    deferEnabled,
    hydratedThrough,
    sentinelRef,
    ensureHydratedThrough,
    isSectionHydrated,
  };
}
