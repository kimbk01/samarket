"use client";

/** 최근 optimistic cart patch — 메뉴 subtree 안정성 관측용 */

let lastPatch: { storeId: string; t0: number } | null = null;

export function publishDeliveryCartPatch(storeId: string): void {
  const id = storeId.trim();
  if (!id) return;
  lastPatch = {
    storeId: id,
    t0: typeof performance !== "undefined" ? performance.now() : Date.now(),
  };
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
