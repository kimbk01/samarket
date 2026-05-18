import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

export function snapshotGeneration(snap: StoreCommerceCartSnapshotV2 | null): number {
  if (!snap) return 0;
  const g = snap.generation;
  if (g != null && Number.isFinite(g) && g > 0) return g;
  const t = snap.touchedAtMs;
  if (t != null && Number.isFinite(t) && t > 0) return t;
  return 0;
}

export function withBumpedGeneration(snap: StoreCommerceCartSnapshotV2): StoreCommerceCartSnapshotV2 {
  const prev = snapshotGeneration(snap);
  const next = Math.max(prev + 1, Date.now());
  return { ...snap, v: 2, generation: next };
}

/**
 * 외부(storage·다른 탭) 스냅샷 적용 여부 — 오래된 generation 덮어쓰기 방지.
 */
export function shouldApplyExternalCommerceCartSnapshot(
  current: StoreCommerceCartSnapshotV2 | null,
  incoming: StoreCommerceCartSnapshotV2 | null
): boolean {
  if (incoming === null && current === null) return false;
  if (incoming === null) return current !== null;
  if (current === null) return true;
  return snapshotGeneration(incoming) >= snapshotGeneration(current);
}
