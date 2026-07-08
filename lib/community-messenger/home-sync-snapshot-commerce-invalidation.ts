/**
 * Home-sync snapshot invalidation for commerce lifecycle (trade product_chats · store orders).
 */
import { invalidateHomeSyncSnapshotCache } from "@/lib/community-messenger/home-sync-snapshot-cache";

function dedupeUserIds(userIds: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of userIds) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** `product_chats` lifecycle field change — seller + buyer home-sync snapshot refresh. */
export function invalidateHomeSyncSnapshotForTradeLifecycle(userIds: Iterable<string>): void {
  for (const uid of dedupeUserIds(userIds)) {
    invalidateHomeSyncSnapshotCache(uid);
  }
}

/** `store_orders` lifecycle / status change — affected CM viewers. */
export function invalidateHomeSyncSnapshotForStoreOrderLifecycle(userIds: Iterable<string>): void {
  for (const uid of dedupeUserIds(userIds)) {
    invalidateHomeSyncSnapshotCache(uid);
  }
}
