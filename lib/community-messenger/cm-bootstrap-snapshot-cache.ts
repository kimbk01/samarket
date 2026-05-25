/**
 * CMB1 bootstrap snapshot invalidation — domain events → counter refresh.
 */
import { scheduleCmBootstrapSnapshotRefresh } from "@/lib/community-messenger/cm-bootstrap-snapshot-refresh";

const invalidatedUserIds = new Set<string>();

/** CM message / read / participant change — schedule bootstrap snapshot refresh. */
export function invalidateCmBootstrapSnapshotCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  invalidatedUserIds.add(k);
  scheduleCmBootstrapSnapshotRefresh(k);
}

export function peekCmBootstrapSnapshotInvalidated(userId: string): boolean {
  return invalidatedUserIds.has(userId.trim());
}

export function clearCmBootstrapSnapshotInvalidation(userId: string): void {
  invalidatedUserIds.delete(userId.trim());
}
