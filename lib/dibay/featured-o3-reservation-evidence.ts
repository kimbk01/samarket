"use client";

/**
 * O3 reservation determinism evidence (dev diagnostic only).
 * Does not change product UX — records snapshot lifecycle vs chrome/READY.
 */

import { deliveryPresentationMarkEvent } from "@/lib/dibay/delivery-presentation-evidence";

export type FeaturedO3ReservationSnapshot = {
  t: number;
  label: string;
  featuredSoftHosted: boolean;
  storeChromeActive: boolean;
  liveCollapse: boolean;
  pinnedCollapse: boolean | null;
  effectiveCollapse: boolean;
  headerSolid: boolean;
  heroVisualForHeader: boolean;
  headerElevated: boolean;
  fulfillmentCardExpected: boolean;
};

const trail: FeaturedO3ReservationSnapshot[] = [];
let lastKey = "";

export function markFeaturedO3Reservation(
  label: string,
  input: Omit<FeaturedO3ReservationSnapshot, "t" | "label" | "fulfillmentCardExpected">
): void {
  if (typeof window === "undefined") return;
  const snap: FeaturedO3ReservationSnapshot = {
    t: performance.now(),
    label,
    ...input,
    fulfillmentCardExpected: !input.effectiveCollapse,
  };
  const key = [
    label,
    snap.featuredSoftHosted ? 1 : 0,
    snap.storeChromeActive ? 1 : 0,
    snap.liveCollapse ? 1 : 0,
    snap.pinnedCollapse === null ? "n" : snap.pinnedCollapse ? 1 : 0,
    snap.effectiveCollapse ? 1 : 0,
    snap.headerSolid ? 1 : 0,
    snap.heroVisualForHeader ? 1 : 0,
  ].join("|");
  if (key === lastKey) return;
  lastKey = key;
  trail.push(snap);
  deliveryPresentationMarkEvent("o3Reservation", {
    label,
    featuredSoftHosted: snap.featuredSoftHosted,
    storeChromeActive: snap.storeChromeActive,
    liveCollapse: snap.liveCollapse,
    pinnedCollapse: snap.pinnedCollapse,
    effectiveCollapse: snap.effectiveCollapse,
    headerSolid: snap.headerSolid,
    heroVisualForHeader: snap.heroVisualForHeader,
    headerElevated: snap.headerElevated,
    fulfillmentCardExpected: snap.fulfillmentCardExpected,
  });
  (
    window as unknown as { __dibayFeaturedO3Reservation?: unknown }
  ).__dibayFeaturedO3Reservation = getFeaturedO3ReservationEvidence();
}

export function getFeaturedO3ReservationEvidence(): {
  trail: FeaturedO3ReservationSnapshot[];
  firstPinAt: number | null;
  firstChromeActiveAt: number | null;
  pinBeforeChrome: boolean | null;
  chromeWithPinnedNull: boolean;
} {
  const firstPin = trail.find((s) => s.pinnedCollapse != null);
  const firstChrome = trail.find((s) => s.storeChromeActive);
  const chromeWithPinnedNull = trail.some(
    (s) => s.storeChromeActive && s.pinnedCollapse == null && s.featuredSoftHosted
  );
  return {
    trail: trail.slice(-60),
    firstPinAt: firstPin?.t ?? null,
    firstChromeActiveAt: firstChrome?.t ?? null,
    pinBeforeChrome:
      firstPin && firstChrome
        ? firstPin.t <= firstChrome.t
        : firstPin && !firstChrome
          ? true
          : null,
    chromeWithPinnedNull,
  };
}

export function resetFeaturedO3ReservationEvidenceForTests(): void {
  trail.length = 0;
  lastKey = "";
}
