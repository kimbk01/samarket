/**
 * CMB1 bootstrap snapshot invalidation — domain events mark obsolete; recompute on next home read.
 */
import { bumpBootstrapSnapshotInvalidation } from "@/lib/community-messenger/bootstrap-snapshot-invalidation";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "cmb1-bootstrap-snapshot:";
const invalidatedUserIds = new Set<string>();

/** CM message / read / participant change — mark snapshot obsolete (no eager RPC). */
export function invalidateCmBootstrapSnapshotCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  invalidatedUserIds.add(k);
  forgetSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${k}`);
  bumpBootstrapSnapshotInvalidation(k);
}

export function peekCmBootstrapSnapshotInvalidated(userId: string): boolean {
  return invalidatedUserIds.has(userId.trim());
}

export function clearCmBootstrapSnapshotInvalidation(userId: string): void {
  invalidatedUserIds.delete(userId.trim());
}
