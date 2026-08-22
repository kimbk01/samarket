"use client";

/** Dev/runtime audit counters — HARD LOCK proof. */
export type StoresHomeHeaderRuntimeCounters = {
  scrollCorrectionCount: number;
  tier1HideCount: number;
  tier1ShowCount: number;
  tier2RevealCount: number;
  tier2CollapseCount: number;
};

const counters: StoresHomeHeaderRuntimeCounters = {
  scrollCorrectionCount: 0,
  tier1HideCount: 0,
  tier1ShowCount: 0,
  tier2RevealCount: 0,
  tier2CollapseCount: 0,
};

export function getStoresHomeHeaderRuntimeCounters(): StoresHomeHeaderRuntimeCounters {
  return { ...counters };
}

export function resetStoresHomeHeaderRuntimeCounters(): void {
  counters.scrollCorrectionCount = 0;
  counters.tier1HideCount = 0;
  counters.tier1ShowCount = 0;
  counters.tier2RevealCount = 0;
  counters.tier2CollapseCount = 0;
}

export function noteStoresHomeTier1HiddenChanged(hidden: boolean): void {
  if (hidden) counters.tier1HideCount += 1;
  else counters.tier1ShowCount += 1;
}

export function noteStoresHomeTier2RevealedChanged(revealed: boolean): void {
  if (revealed) counters.tier2RevealCount += 1;
  else counters.tier2CollapseCount += 1;
}

/** HARD LOCK guard — must stay 0 in /stores header chrome modules. */
export function noteStoresHomeScrollCorrectionBlocked(caller: string): void {
  counters.scrollCorrectionCount += 1;
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.warn(`[stores-home-header] scroll correction blocked at ${caller}`);
  }
}

export function sampleStoresHomeHeaderGeometry(): {
  tier1InstanceMax: number;
  tier2InstanceMax: number;
  tier3InstanceMax: number;
  tier1Rect: DOMRect | null;
  tier2Rect: DOMRect | null;
  tier3Rect: DOMRect | null;
  contentStartTop: number | null;
  tier3Bottom: number | null;
} {
  if (typeof document === "undefined") {
    return {
      tier1InstanceMax: 0,
      tier2InstanceMax: 0,
      tier3InstanceMax: 0,
      tier1Rect: null,
      tier2Rect: null,
      tier3Rect: null,
      contentStartTop: null,
      tier3Bottom: null,
    };
  }
  const t1 = document.querySelector('[data-stores-home-tier="1"]');
  const t2 = document.querySelector('[data-stores-home-tier="2"]');
  const t3 = document.querySelector('[data-stores-home-tier="3"]');
  const cs = document.querySelector("[data-stores-home-scroll-content-start]");
  const tb = document.querySelector("[data-stores-home-tier3-boundary]");
  return {
    tier1InstanceMax: document.querySelectorAll('[data-stores-home-tier="1"]').length,
    tier2InstanceMax: document.querySelectorAll('[data-stores-home-tier="2"]').length,
    tier3InstanceMax: document.querySelectorAll('[data-stores-home-tier="3"]').length,
    tier1Rect: t1?.getBoundingClientRect() ?? null,
    tier2Rect: t2?.getBoundingClientRect() ?? null,
    tier3Rect: t3?.getBoundingClientRect() ?? null,
    contentStartTop: cs?.getBoundingClientRect().top ?? null,
    tier3Bottom: tb?.getBoundingClientRect().bottom ?? null,
  };
}
