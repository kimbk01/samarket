/**
 * Dev-only — owner hub badge refresh 연쇄·mark_read 체인 추적.
 */

const WINDOW_MS = 10_000;

type HubRefreshGuardEntry = {
  source: string;
  reason: string;
  dedupe_hit?: boolean;
  snapshot_same_skip?: boolean;
  inflight_join?: boolean;
  cmFresh_bypass_blocked?: boolean;
  refresh_collapsed?: boolean;
  request_count_10s?: number;
};

type MarkReadRefreshChainEntry = {
  roomId: string | null;
  messageId: string | null;
  triggered_hub_refresh: boolean;
  refresh_skipped: boolean;
  same_snapshot: boolean;
  collapsed: boolean;
  reason?: string;
};

type ParticipantUnreadHubRefreshEntry = {
  event_room_id: string | null;
  event_user_id: string | null;
  source: string;
  reason: string;
  dedupe_hit?: boolean;
  same_room_skip?: boolean;
  recent_mark_read_gap_skip?: boolean;
  cmFresh_bypass_allowed?: boolean;
  cmFresh_bypass_blocked?: boolean;
  hub_fetch_triggered?: boolean;
  hub_fetch_skipped?: boolean;
  inflight_join?: boolean;
  request_count_10s?: number;
};

const recentParticipantHubRefresh = new Map<string, number[]>();

function recordParticipantHubRefreshRequest(source: string, now = Date.now()): number {
  const key = source.trim() || "community_messenger_participant";
  const prev = recentParticipantHubRefresh.get(key) ?? [];
  const next = pruneWindow(now, prev);
  next.push(now);
  recentParticipantHubRefresh.set(key, next);
  return next.length;
}

export function logParticipantUnreadHubRefresh(entry: ParticipantUnreadHubRefreshEntry): void {
  if (process.env.NODE_ENV !== "development") return;
  const source = entry.source.trim() || "community_messenger_participant";
  console.debug("[participant-unread-hub-refresh]", {
    event_room_id: entry.event_room_id,
    event_user_id: entry.event_user_id,
    source,
    reason: entry.reason,
    dedupe_hit: entry.dedupe_hit ?? false,
    same_room_skip: entry.same_room_skip ?? false,
    recent_mark_read_gap_skip: entry.recent_mark_read_gap_skip ?? false,
    cmFresh_bypass_allowed: entry.cmFresh_bypass_allowed ?? false,
    cmFresh_bypass_blocked: entry.cmFresh_bypass_blocked ?? false,
    hub_fetch_triggered: entry.hub_fetch_triggered ?? false,
    hub_fetch_skipped: entry.hub_fetch_skipped ?? false,
    inflight_join: entry.inflight_join ?? false,
    request_count_10s: entry.request_count_10s ?? recordParticipantHubRefreshRequest(source),
  });
}

const recentBySource = new Map<string, number[]>();

function pruneWindow(now: number, bucket: number[]): number[] {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < bucket.length && bucket[i]! < cutoff) i += 1;
  return i > 0 ? bucket.slice(i) : bucket;
}

function recordHubRefreshGuardRequest(source: string, now = Date.now()): number {
  const key = source.trim() || "(unknown)";
  const prev = recentBySource.get(key) ?? [];
  const next = pruneWindow(now, prev);
  next.push(now);
  recentBySource.set(key, next);
  return next.length;
}

export function logHubRefreshGuard(entry: HubRefreshGuardEntry): void {
  if (process.env.NODE_ENV !== "development") return;
  const source = entry.source.trim() || "(unknown)";
  const request_count_10s =
    entry.request_count_10s ?? recordHubRefreshGuardRequest(source);
  console.debug("[hub-refresh-guard]", {
    source,
    reason: entry.reason,
    dedupe_hit: entry.dedupe_hit ?? false,
    snapshot_same_skip: entry.snapshot_same_skip ?? false,
    inflight_join: entry.inflight_join ?? false,
    cmFresh_bypass_blocked: entry.cmFresh_bypass_blocked ?? false,
    refresh_collapsed: entry.refresh_collapsed ?? false,
    request_count_10s,
  });
}

export function logMarkReadRefreshChain(entry: MarkReadRefreshChainEntry): void {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[mark-read-refresh-chain]", {
    roomId: entry.roomId,
    messageId: entry.messageId,
    triggered_hub_refresh: entry.triggered_hub_refresh,
    refresh_skipped: entry.refresh_skipped,
    same_snapshot: entry.same_snapshot,
    collapsed: entry.collapsed,
    ...(entry.reason ? { reason: entry.reason } : {}),
  });
}
