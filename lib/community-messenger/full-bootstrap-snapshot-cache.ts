/**
 * FBT1 full bootstrap snapshot invalidation.
 * Invalidation = DB watermark + drop in-process single-flight. No eager RPC refresh.
 */
import { bumpBootstrapSnapshotInvalidation } from "@/lib/community-messenger/bootstrap-snapshot-invalidation";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "fbt1-bootstrap-snapshot:";

export function invalidateFullBootstrapSnapshotCache(
  userId?: string,
  reason?: string,
  opts?: { deferWatermark?: boolean }
): void {
  const uid = userId?.trim();
  if (uid) {
    forgetSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}full:${uid}`);
    forgetSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}critical:${uid}`);
    /** 2026-11-21 보내기 2단계 — deferWatermark 면 호출부가 묶어 쓴다 */
    if (opts?.deferWatermark !== true) bumpBootstrapSnapshotInvalidation(uid);
  }
  if (process.env.NODE_ENV === "development" && reason) {
    console.log("[full-bootstrap-snapshot-invalidate]", { user_id: uid ?? "*", reason });
  }
}
