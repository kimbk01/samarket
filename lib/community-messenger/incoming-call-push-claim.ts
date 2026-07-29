/**
 * Durable claim for incoming call push fan-out across serverless instances.
 * CAS: SET incoming_push_claimed_at WHERE NULL — only one instance wins.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type IncomingPushClaimResult =
  | { claimed: true; claimedAt: string }
  | { claimed: false; reason: "already_claimed" | "session_missing" | "claim_failed"; claimedAt?: string };

export async function tryClaimIncomingCallPushDispatch(
  svc: SupabaseClient,
  sessionId: string,
): Promise<IncomingPushClaimResult> {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return { claimed: false, reason: "session_missing" };

  const claimedAt = new Date().toISOString();
  const { data, error } = await svc
    .from("community_messenger_call_sessions")
    .update({ incoming_push_claimed_at: claimedAt })
    .eq("id", sid)
    .is("incoming_push_claimed_at", null)
    .select("id, incoming_push_claimed_at")
    .maybeSingle();

  if (error) {
    // Column missing / schema lag — fail open so calls still ring (process-local still helps).
    if (
      error.message?.includes("incoming_push_claimed_at") ||
      error.message?.includes("does not exist") ||
      error.code === "42703"
    ) {
      console.warn("[cm-call-voip] incoming_push_claim_column_missing_fail_open", {
        sessionId: sid,
        error: error.message,
      });
      return { claimed: true, claimedAt };
    }
    console.error("[cm-call-voip] incoming_push_claim_failed", {
      sessionId: sid,
      error: error.message,
    });
    return { claimed: false, reason: "claim_failed" };
  }

  if (data?.id) {
    return { claimed: true, claimedAt: String(data.incoming_push_claimed_at ?? claimedAt) };
  }

  const { data: existing } = await svc
    .from("community_messenger_call_sessions")
    .select("id, incoming_push_claimed_at")
    .eq("id", sid)
    .maybeSingle();

  if (!existing?.id) return { claimed: false, reason: "session_missing" };
  return {
    claimed: false,
    reason: "already_claimed",
    claimedAt: existing.incoming_push_claimed_at
      ? String(existing.incoming_push_claimed_at)
      : undefined,
  };
}
