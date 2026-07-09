import type { SupabaseClient } from "@supabase/supabase-js";

/** Auth RFC v1.0 — Realtime credential delivery TTL cap (seconds). */
export const REALTIME_CREDENTIAL_TTL_SECONDS = 900;

export const CALL_REALTIME_CREDENTIALS_RATE_LIMIT = {
  limit: 45,
  windowMs: 60_000,
} as const;

export const CALL_REALTIME_CREDENTIALS_RATE_LIMIT_KEY_PREFIX =
  "community-messenger:call-realtime-credentials:";

export const CALL_REALTIME_CREDENTIALS_RATE_LIMIT_CODE =
  "community_messenger_call_realtime_credentials_rate_limited";

export type RealtimeCredentialMintResult =
  | { ok: true; accessToken: string; expiresAt: string }
  | { ok: false; error: "session_unavailable" };

export function computeRealtimeCredentialExpiresAtIso(input: {
  sessionExpiresAtSeconds: number | null | undefined;
  nowMs?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const capMs = nowMs + REALTIME_CREDENTIAL_TTL_SECONDS * 1000;
  const sessionMs =
    typeof input.sessionExpiresAtSeconds === "number" && Number.isFinite(input.sessionExpiresAtSeconds)
      ? input.sessionExpiresAtSeconds * 1000
      : capMs;
  return new Date(Math.min(sessionMs, capMs)).toISOString();
}

export async function mintCommunityMessengerCallRealtimeCredentials(
  supabase: SupabaseClient | null
): Promise<RealtimeCredentialMintResult> {
  if (!supabase) {
    return { ok: false, error: "session_unavailable" };
  }

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token?.trim() ?? "";
  if (error || !accessToken) {
    return { ok: false, error: "session_unavailable" };
  }

  return {
    ok: true,
    accessToken,
    expiresAt: computeRealtimeCredentialExpiresAtIso({
      sessionExpiresAtSeconds: data.session?.expires_at ?? null,
    }),
  };
}
