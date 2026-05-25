/**
 * Legacy CM bootstrap monolith — temporary fallback only (CMB1).
 */
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import type { CommunityMessengerBootstrapDiagnostics } from "@/lib/community-messenger/service";
import { getCommunityMessengerBootstrap } from "@/lib/community-messenger/service";
import { auditLegacyFallbackUsage } from "@/lib/ops/legacy-fallback-usage-audit";
import {
  evaluateCmBootstrapRegressionGuards,
  type CmBootstrapSnapshotBreakdown,
} from "@/lib/community-messenger/cm-bootstrap-regression-guard";
import { logCmBootstrapMonolithAnalysis } from "@/lib/community-messenger/cm-bootstrap-monolith-hotpath-analysis";

export async function buildCmBootstrapLiteLegacy(
  userId: string,
  options: {
    diagnostics: CommunityMessengerBootstrapDiagnostics;
    bypassLiteRoomsCache?: boolean;
  }
): Promise<CommunityMessengerBootstrap> {
  auditLegacyFallbackUsage({
    route: "/api/community-messenger/bootstrap?lite=1",
    fallback_branch: "legacy_bootstrap_monolith",
    reason: "unified_rpc_unavailable",
  });
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot deploy probe
    console.warn("[cm-bootstrap-snapshot-fallback]", {
      user_id: userId,
      reason: "unified_rpc_unavailable",
    });
  }

  const t0 = performance.now();
  const payload = await getCommunityMessengerBootstrap(userId, {
    skipDiscoverable: true,
    deferCallLog: true,
    diagnostics: options.diagnostics,
    bypassLiteRoomsCache: options.bypassLiteRoomsCache,
  });
  const totalMs = Math.round(performance.now() - t0);

  const breakdown: CmBootstrapSnapshotBreakdown = {
    route: "/api/community-messenger/bootstrap",
    total_ms: totalMs,
    db_ms: options.diagnostics.roomsQueryMs + options.diagnostics.profilesMs + options.diagnostics.unreadMs,
    round_trips: options.diagnostics.roomsPayloadDbRoundTrips + 3,
    transport_ms: options.diagnostics.roomsQueryMs,
    payload_build_ms: options.diagnostics.transformMs,
    room_list_fetch_ms: options.diagnostics.roomsQueryMs,
    participant_join_ms: options.diagnostics.roomsQueryRound2ParticipantsMs,
    profile_join_ms: options.diagnostics.profilesMs,
    unread_compute_ms: options.diagnostics.unreadMs,
    room_summary_compute_ms: options.diagnostics.transformMs,
    notification_merge_ms: 0,
    silent_delta_merge_ms: 0,
    bootstrap_cache_ms: 0,
    cache_hit: 0,
    wave_count: 3,
    query_wave_2_ms: options.diagnostics.tradeContextMs,
    sequential_await_detected: 1,
    aggregate_compute_detected: 1,
    repeated_join_detected: 1,
    fallback_used: 1,
    reconnect_path_used: 0,
    rpc_removed: 0,
    snapshot_via: "legacy_bootstrap_monolith",
    worst_stage: "legacy_bootstrap_monolith",
    worst_stage_ms: totalMs,
  };
  logCmBootstrapMonolithAnalysis(breakdown);
  evaluateCmBootstrapRegressionGuards(breakdown);

  return payload;
}
