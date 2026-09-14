/**
 * Source auth mode + session status (server-side refs only).
 * No plaintext password storage. No CAPTCHA/CF bypass.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExternalBoardAuthMode = "public" | "login_required" | "session_required";
export type ExternalBoardSessionStatus =
  | "login_required"
  | "authenticated"
  | "expired"
  | "failed";

export const AUTH_MODE_LABELS: Record<ExternalBoardAuthMode, string> = {
  public: "공개 소스",
  login_required: "로그인 필요",
  session_required: "세션 필요",
};

export const SESSION_STATUS_LABELS: Record<ExternalBoardSessionStatus, string> = {
  login_required: "로그인 필요",
  authenticated: "로그인됨",
  expired: "로그인 만료",
  failed: "로그인 실패",
};

export const COLLECT_GATE_LOGIN_REQUIRED = "이 정보 소스에 다시 로그인해 주세요.";

export function normalizeAuthMode(raw: unknown): ExternalBoardAuthMode {
  const v = String(raw ?? "public").trim();
  if (v === "login_required" || v === "session_required") return v;
  return "public";
}

export async function getExternalBoardSourceSession(
  sb: SupabaseClient,
  sourceId: string
): Promise<{
  status: ExternalBoardSessionStatus;
  expiresAt: string | null;
  credentialRef: string | null;
} | null> {
  const { data, error } = await sb
    .from("external_board_source_sessions")
    .select("status, expires_at, credential_ref")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: (data.status as ExternalBoardSessionStatus) || "login_required",
    expiresAt: data.expires_at != null ? String(data.expires_at) : null,
    credentialRef: data.credential_ref != null ? String(data.credential_ref) : null,
  };
}

/**
 * Collect gate for authenticated sources.
 * Public sources always pass auth check.
 */
export async function assertSourceSessionForCollect(input: {
  sb: SupabaseClient;
  sourceId: string;
  authMode: ExternalBoardAuthMode;
}): Promise<{ ok: true } | { ok: false; failureCode: "login_required"; failureMessage: string }> {
  if (input.authMode === "public") return { ok: true };
  const session = await getExternalBoardSourceSession(input.sb, input.sourceId);
  if (!session || session.status !== "authenticated") {
    return {
      ok: false,
      failureCode: "login_required",
      failureMessage: COLLECT_GATE_LOGIN_REQUIRED,
    };
  }
  if (session.expiresAt) {
    const exp = Date.parse(session.expiresAt);
    if (!Number.isNaN(exp) && exp <= Date.now()) {
      await input.sb
        .from("external_board_source_sessions")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("source_id", input.sourceId);
      return {
        ok: false,
        failureCode: "login_required",
        failureMessage: COLLECT_GATE_LOGIN_REQUIRED,
      };
    }
  }
  return { ok: true };
}
