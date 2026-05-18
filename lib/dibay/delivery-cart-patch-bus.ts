"use client";

/** 최근 optimistic cart patch — 메뉴 subtree 안정성 관측용 */

let lastPatch: { storeId: string; t0: number; generation: number | null } | null = null;

const PATCH_DEDUPE_MS = 48;

export function publishDeliveryCartPatch(storeId: string, cartGeneration?: number | null): void {
  const id = storeId.trim();
  if (!id) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const gen = cartGeneration ?? null;
  if (
    lastPatch &&
    lastPatch.storeId === id &&
    lastPatch.generation === gen &&
    now - lastPatch.t0 < PATCH_DEDUPE_MS
  ) {
    return;
  }
  lastPatch = { storeId: id, t0: now, generation: gen };
}

export function msSinceDeliveryCartPatch(storeId: string): number | null {
  const id = storeId.trim();
  if (!lastPatch || lastPatch.storeId !== id) return null;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return Math.max(0, now - lastPatch.t0);
}

export function resetDeliveryCartPatchBusForTests(): void {
  lastPatch = null;
}
