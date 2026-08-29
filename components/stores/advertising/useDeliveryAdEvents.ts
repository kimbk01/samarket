"use client";

import { useEffect, useRef } from "react";
import { DELIVERY_AD_IMPRESSION_VIEWABILITY } from "@/lib/stores/advertising/delivery-ad-event-contract";

type Props = {
  enabled: boolean;
  exposureToken: string | null | undefined;
  sessionSeed: string;
  onImpressionRecorded?: (impressionEventId: string | null) => void;
};

function postEvent(path: string, body: Record<string, unknown>) {
  const json = JSON.stringify(body);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([json], { type: "application/json" });
      if (navigator.sendBeacon(path, blob)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
    credentials: "include",
  }).catch(() => {});
}

/**
 * CUT G — customer-only viewability observer.
 * Owner/Admin preview must pass enabled=false.
 */
export function useDeliveryAdImpressionObserver(
  elementRef: React.RefObject<Element | null>,
  props: Props
) {
  const firedRef = useRef(false);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!props.enabled || !props.exposureToken) return;
    const el = elementRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const cleanup = () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || firedRef.current) return;
        const visible =
          typeof document === "undefined" || document.visibilityState === "visible";
        const ratioOk = entry.isIntersecting && entry.intersectionRatio >= DELIVERY_AD_IMPRESSION_VIEWABILITY.minVisibleRatio;
        if (!visible || !ratioOk) {
          cleanup();
          return;
        }
        if (dwellTimerRef.current) return;
        dwellTimerRef.current = setTimeout(() => {
          if (firedRef.current) return;
          if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
          firedRef.current = true;
          const eventId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `imp_${Date.now()}`;
          postEvent("/api/stores/ads/impression", {
            exposureToken: props.exposureToken,
            eventId,
            sessionSeed: props.sessionSeed,
            occurredAt: new Date().toISOString(),
          });
          props.onImpressionRecorded?.(null);
        }, DELIVERY_AD_IMPRESSION_VIEWABILITY.minDwellMs);
      },
      { threshold: [0, DELIVERY_AD_IMPRESSION_VIEWABILITY.minVisibleRatio, 1] }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cleanup();
    };
  }, [elementRef, props.enabled, props.exposureToken, props.sessionSeed, props.onImpressionRecorded]);
}

export function reportDeliveryAdClick(input: {
  exposureToken: string;
  sessionSeed: string;
  impressionEventId?: string | null;
  destinationType?: string;
  destinationId?: string;
}) {
  const eventId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `clk_${Date.now()}`;
  postEvent("/api/stores/ads/click", {
    exposureToken: input.exposureToken,
    eventId,
    sessionSeed: input.sessionSeed,
    impressionEventId: input.impressionEventId ?? null,
    destinationType: input.destinationType,
    destinationId: input.destinationId,
    occurredAt: new Date().toISOString(),
  });
}
