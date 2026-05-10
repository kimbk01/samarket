/**
 * `GET …/home-sync?tier=full` 전용 한 줄 분해 — `[home-sync-full-analysis]`
 *
 * 켜기: `SAMARKET_MESSENGER_TRACE_LOG=1` / `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` |
 * `SAMARKET_LOG_HOME_SYNC_FULL_ANALYSIS=1` | `SAMARKET_LOG_HOME_SYNC_BREAKDOWN=1`
 */

import { homeSyncBreakdownEnabled } from "@/lib/community-messenger/home-sync-breakdown-log";
import {
  messengerTraceConsoleDebug,
  messengerVerboseTraceConsoleEnabled,
} from "@/lib/community-messenger/messenger-trace-console";
import { readHomeSyncFullVsCriticalGapMs } from "@/lib/community-messenger/home-sync-critical-route-snapshot";
import { ms, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";

export function homeSyncFullAnalysisEnabled(): boolean {
  return (
    messengerVerboseTraceConsoleEnabled() ||
    process.env.SAMARKET_LOG_HOME_SYNC_FULL_ANALYSIS === "1" ||
    homeSyncBreakdownEnabled()
  );
}

export function logHomeSyncFullAnalysis(args: {
  userId: string;
  trace: HomeSyncTrace;
  routeTotalMs: number;
  serializeMs: number;
  payloadKb: number;
}): void {
  if (!homeSyncFullAnalysisEnabled()) return;
  const trade = args.trace.deepSteps.tradeMetaEnrich;
  const bs = args.trace.deepSteps.bundleSteps;
  const d = trade?.explainedComponentsDetail;
  const trade_fetch_ms =
    ms(trade?.tradePostsFetchMs) +
    ms(trade?.categoryFetchMs) +
    ms(trade?.seedProductChatsMs) +
    ms(trade?.tradePcBridgeQueriesMs) +
    ms(trade?.directKeys?.wallMs) +
    ms(trade?.sellerProfileAttachMs);
  const trade_merge_cpu_ms =
    ms(trade?.cpuMergeMs) +
    ms(d?.phaseBSyncMapCpuMs) +
    ms(d?.phaseCSyncLedgerMapCpuMs) +
    ms(d?.phaseCSyncPcTripleCpuMs) +
    ms(d?.phaseDFinalMergeCpuMs) +
    ms(d?.phaseAPrePostsSyncCpuMs) +
    ms(d?.tradeEnrichPhaseTargetsPrepCpuMs) +
    ms(d?.phaseDPeerIndexCpuMs);
  const rooms_query_ms = ms(bs?.roomsFetchMs);
  const unread_ms = ms(bs?.unreadBadgeMs);
  const profiles_ms = ms(bs?.participantsProfilesMs);
  const full_extra_payload_ms =
    ms(bs?.friendsFetchMs) +
    ms(bs?.friendsRequestsFetchMs) +
    ms(bs?.payloadBuildMs) +
    ms(bs?.listSplitFilterMs) +
    ms(bs?.summarizeRoomsMs);
  const duplicate_trade_merge_count = trade?.duplicateTradeMergeCount ?? 0;
  const full_vs_critical_gap_ms = readHomeSyncFullVsCriticalGapMs(args.userId, args.routeTotalMs);
  try {
    messengerTraceConsoleDebug("[home-sync-full-analysis]", {
      token: args.trace.token ?? null,
      tier: args.trace.tier ?? "full",
      trade_fetch_ms,
      trade_merge_cpu_ms,
      rooms_query_ms,
      unread_ms,
      profiles_ms,
      serialize_ms: Math.round(args.serializeMs * 1000) / 1000,
      full_extra_payload_ms,
      duplicate_trade_merge_count,
      full_vs_critical_gap_ms,
      route_total_ms: Math.round(args.routeTotalMs * 1000) / 1000,
      bundle_total_ms: bs?.bundleTotalMs ?? null,
      trade_meta_total_ms: trade?.totalMs ?? null,
      payload_kb: args.payloadKb,
      note: "trade_fetch_ms ≈ posts+category+seed+bridge+directKeys+seller attach RTT; trade_merge_cpu_ms ≈ cpuMerge+phase sync/merge CPU",
    });
  } catch {
    /* ignore */
  }
}
