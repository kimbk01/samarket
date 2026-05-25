/**
 * FBT1 full bootstrap snapshot invalidation.
 */
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { scheduleFullBootstrapSnapshotRefresh } from "@/lib/community-messenger/full-bootstrap-snapshot-refresh";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "fbt1-bootstrap-snapshot:";

export function invalidateFullBootstrapSnapshotCache(userId?: string, reason?: string): void {
  const uid = userId?.trim();
  if (uid) {
    forgetSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}full:${uid}`);
    forgetSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}critical:${uid}`);
    scheduleFullBootstrapSnapshotRefresh(uid, "full");
    scheduleFullBootstrapSnapshotRefresh(uid, "critical");
  }
  if (process.env.NODE_ENV === "development" && reason) {
    // eslint-disable-next-line no-console -- invalidation probe
    console.log("[full-bootstrap-snapshot-invalidate]", { user_id: uid ?? "*", reason });
  }
}
