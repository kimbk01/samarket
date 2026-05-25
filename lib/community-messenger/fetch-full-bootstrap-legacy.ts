/**
 * Legacy full/critical bootstrap fallback — FBT1 temporary path only.
 */
import {
  getCommunityMessengerBootstrap,
  getCommunityMessengerBootstrapCritical,
} from "@/lib/community-messenger/service";
import type { CommunityMessengerBootstrapDiagnostics } from "@/lib/community-messenger/service";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
} from "@/lib/community-messenger/types";
import { logLegacyFullBootstrapHotpath } from "@/lib/community-messenger/full-bootstrap-snapshot";
import { gateLegacyFallback } from "@/lib/ops/legacy-fallback-usage-audit";

export async function buildFullBootstrapLegacy(
  userId: string,
  opts?: {
    diagnostics?: CommunityMessengerBootstrapDiagnostics;
    bypassLiteRoomsCache?: boolean;
  }
): Promise<CommunityMessengerBootstrap> {
  gateLegacyFallback({
    route: "/api/community-messenger/bootstrap",
    fallback_branch: "legacy_full_bootstrap_monolith",
    reason: "unified_rpc_unavailable",
  });
  const t0 = performance.now();
  const payload = await getCommunityMessengerBootstrap(userId, {
    skipDiscoverable: false,
    deferCallLog: false,
    diagnostics: opts?.diagnostics,
    bypassLiteRoomsCache: opts?.bypassLiteRoomsCache,
  });
  logLegacyFullBootstrapHotpath({
    tier: "full",
    totalMs: performance.now() - t0,
    dbMs: opts?.diagnostics?.bootstrapMonolithWallMs ?? 0,
    roomFetchMs: opts?.diagnostics?.roomsQueryMs ?? 0,
    wave2Ms: (opts?.diagnostics?.roomsQueryRound2Ms ?? 0) + (opts?.diagnostics?.callsLogMs ?? 0),
  });
  return payload;
}

export async function buildCriticalBootstrapLegacy(
  userId: string
): Promise<{
  payload: CommunityMessengerBootstrapCritical;
  tierDiagnostics: Awaited<ReturnType<typeof getCommunityMessengerBootstrapCritical>>["tierDiagnostics"];
  criticalPayloadMs: number;
  dbRoundTrips: number;
  roomCount: number;
}> {
  gateLegacyFallback({
    route: "/api/community-messenger/bootstrap?tier=critical",
    fallback_branch: "legacy_critical_tier_monolith",
    reason: "unified_rpc_unavailable",
  });
  const t0 = performance.now();
  const result = await getCommunityMessengerBootstrapCritical(userId);
  logLegacyFullBootstrapHotpath({
    tier: "critical",
    totalMs: performance.now() - t0,
    dbMs: result.criticalPayloadMs,
    roomFetchMs: result.tierDiagnostics.roomsQueryMs,
    wave2Ms: result.tierDiagnostics.participantsQueryMs,
  });
  return result;
}
