/**
 * PATCH action=media_connected — native media evidence writer for connected_at.
 *
 * Evidence: Agora remote user joined (uid != 0), reported by either party.
 * Heartbeat / callee local join are NOT evidence.
 * Stamps connected_at = server now() only WHERE status='active' AND connected_at IS NULL (CAS).
 * Legacy action=connected (JS proposal) stays unchanged for old binaries.
 *
 * @see evaluateMediaConnectedEvidence (call-connected-authority)
 */
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  CALL_MEDIA_CONNECTED_EVIDENCE_REMOTE_USER_JOINED,
  evaluateMediaConnectedEvidence,
} from "@/lib/community-messenger/call-authority/call-connected-authority";
import { getCommunityMessengerCallSessionById } from "@/lib/community-messenger/service";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type MediaConnectedRow = {
  id: string;
  status: string | null;
  initiator_user_id: string;
  recipient_user_id: string | null;
  connected_at: string | null;
};

export type MediaConnectedResult = {
  ok: boolean;
  session?: CommunityMessengerCallSession;
  error?: string;
  idempotent?: boolean;
};

export async function recordCommunityMessengerCallMediaConnected(input: {
  userId: string;
  sessionId: string;
  evidence: unknown;
  remoteUid?: unknown;
  platform?: unknown;
}): Promise<MediaConnectedResult> {
  const sessionId = trimText(input.sessionId);
  const userId = trimText(input.userId);
  if (!sessionId || !userId) return { ok: false, error: "session_required" };

  const sb = resolveServiceSupabaseForApi();
  if (!sb) return { ok: false, error: "db_unavailable" };

  const select = "id, status, initiator_user_id, recipient_user_id, connected_at";
  const { data: row } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select(select)
    .eq("id", sessionId)
    .maybeSingle();
  if (!row) return { ok: false, error: "not_found" };
  const session = row as MediaConnectedRow;

  const decision = evaluateMediaConnectedEvidence({
    status: session.status,
    connectedAt: session.connected_at,
    actorUserId: userId,
    initiatorUserId: session.initiator_user_id,
    recipientUserId: session.recipient_user_id,
    evidence: input.evidence,
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  let stamped = false;
  if (decision.kind === "stamp") {
    const now = new Date().toISOString();
    const { data: updated, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .update({ connected_at: now, updated_at: now })
      .eq("id", sessionId)
      .eq("status", "active")
      .is("connected_at", null)
      .select(select)
      .maybeSingle();
    if (error) return { ok: false, error: "call_session_update_failed" };
    if (updated) {
      stamped = true;
    } else {
      // CAS lost — re-read: already stamped → idempotent; otherwise no longer active.
      const { data: freshRow } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select(select)
        .eq("id", sessionId)
        .maybeSingle();
      const fresh = (freshRow ?? null) as MediaConnectedRow | null;
      if (!fresh) return { ok: false, error: "not_found" };
      if (!trimText(fresh.connected_at ?? "")) return { ok: false, error: "not_active" };
    }
  }

  const remoteUid = trimText(String(input.remoteUid ?? "")).slice(0, 64);
  const platform = trimText(String(input.platform ?? "")).slice(0, 16);
  try {
    // event_type CHECK allows 'connected' — evidence distinguishes from legacy JS proposal.
    await (sb as any).from("community_messenger_call_events").insert({
      session_id: sessionId,
      actor_user_id: userId,
      event_type: "connected",
      payload: {
        source: "native_media_evidence",
        evidence: CALL_MEDIA_CONNECTED_EVIDENCE_REMOTE_USER_JOINED,
        stamped,
        ...(remoteUid ? { remote_uid: remoteUid } : {}),
        ...(platform ? { platform } : {}),
      },
    });
  } catch {
    /* audit best-effort */
  }

  const mapped = await getCommunityMessengerCallSessionById(userId, sessionId);
  if (!mapped) return { ok: false, error: "map_failed" };
  return stamped ? { ok: true, session: mapped } : { ok: true, session: mapped, idempotent: true };
}
