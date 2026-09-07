/**
 * Expired RINGING → MISSED (CUT 2).
 * Distinct from ACTIVE presence stale cleanup (CUT 1 heartbeat_timeout).
 *
 * Canonical deadline: started_at + admin incoming_ring_timeout_seconds (server clock).
 * Always transitions via updateCommunityMessengerCallSession action=missed.
 */
import type { MessengerCallAdminPolicy } from "@/lib/community-messenger/messenger-call-admin-policy";
import {
  isCanonicalRingingExpiredForMissed,
  resolveCanonicalRingTimeoutSeconds,
} from "@/lib/community-messenger/call-authority/call-missed-deadline-authority";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { getMessengerCallAdminPolicyCached } from "@/lib/community-messenger/messenger-call-admin-policy";

/** @deprecated CUT2 — prefer isCanonicalRingingExpiredForMissed (no extra grace on miss truth). */
export const STALE_RINGING_GRACE_MS = 0;

export type StaleRingingSessionRow = {
  id: string;
  status: string;
  started_at: string | null;
  initiator_user_id: string | null;
  recipient_user_id: string | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isDirectRingingSessionExpired(
  startedAt: string | null | undefined,
  policy: MessengerCallAdminPolicy,
  nowMs = Date.now(),
): boolean {
  return isCanonicalRingingExpiredForMissed(startedAt, policy, nowMs);
}

export function isStaleRingingRow(
  row: Pick<StaleRingingSessionRow, "status" | "started_at">,
  policy: MessengerCallAdminPolicy,
  nowMs = Date.now(),
): boolean {
  return trimText(row.status) === "ringing" && isDirectRingingSessionExpired(row.started_at, policy, nowMs);
}

async function terminalOneExpiredRingingAsMissed(
  actorUserId: string,
  row: StaleRingingSessionRow,
): Promise<boolean> {
  const sid = trimText(row.id);
  const uid = trimText(actorUserId);
  if (!sid || !uid) return false;
  const { updateCommunityMessengerCallSession } = await import("@/lib/community-messenger/service");
  // CUT2: ringing deadline expiry is always MISSED — never cancel (cancel = caller intent).
  const result = await updateCommunityMessengerCallSession({
    userId: uid,
    sessionId: sid,
    action: "missed",
    clientEndedReason: "stale_ringing_expired",
  }).catch(() => ({ ok: false as const }));
  return result.ok === true;
}

/** viewer 관련 ringing direct 중 링 deadline 지난 세션을 MISSED 처리 */
export async function terminalStaleRingingDirectSessionsForUser(
  sb: unknown,
  userId: string,
  policy: MessengerCallAdminPolicy,
): Promise<number> {
  const uid = trimText(userId);
  if (!uid) return 0;
  const { data, error } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, status, started_at, initiator_user_id, recipient_user_id")
    .eq("session_mode", "direct")
    .eq("status", "ringing")
    .or(`initiator_user_id.eq.${uid},recipient_user_id.eq.${uid}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return 0;
  const rows = ((data ?? []) as StaleRingingSessionRow[]).filter((row) => isStaleRingingRow(row, policy));
  let closed = 0;
  for (const row of rows) {
    const actor =
      trimText(row.recipient_user_id) ||
      trimText(row.initiator_user_id) ||
      uid;
    if (await terminalOneExpiredRingingAsMissed(actor, row)) closed += 1;
  }
  return closed;
}

/**
 * Cron/job — expire all direct ringing past canonical deadline → MISSED.
 * Separated from active both-stale heartbeat cleanup.
 */
export async function cleanupExpiredRingingCommunityMessengerCallSessions(): Promise<{
  missed: number;
  ringTimeoutSeconds: number;
}> {
  const sb = resolveServiceSupabaseForApi();
  const policy = await getMessengerCallAdminPolicyCached();
  const ringTimeoutSeconds = resolveCanonicalRingTimeoutSeconds(policy);
  if (!sb) return { missed: 0, ringTimeoutSeconds };

  const { data: rows } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, status, started_at, initiator_user_id, recipient_user_id")
    .eq("status", "ringing")
    .order("started_at", { ascending: true })
    .limit(100);

  const nowMs = Date.now();
  let missed = 0;
  for (const row of (rows ?? []) as StaleRingingSessionRow[]) {
    if (!isStaleRingingRow(row, policy, nowMs)) continue;
    const actor =
      trimText(row.recipient_user_id) ||
      trimText(row.initiator_user_id);
    if (!actor) continue;
    if (await terminalOneExpiredRingingAsMissed(actor, row)) missed += 1;
  }
  return { missed, ringTimeoutSeconds };
}
