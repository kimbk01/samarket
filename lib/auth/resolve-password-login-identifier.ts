import {
  buildManualMemberAuthEmail,
  resolveManualMemberSignInEmail,
} from "@/lib/auth/manual-member-email";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type ResolvedPasswordLoginIdentifier =
  | { ok: true; identifier: string }
  | { ok: false; status: number; error: string };

export async function resolvePasswordLoginIdentifier(raw: string): Promise<ResolvedPasswordLoginIdentifier> {
  const trimmed = raw.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized) return { ok: false, status: 400, error: "이메일 또는 아이디를 입력하세요." };
  if (normalized.includes("@")) {
    return { ok: true, identifier: normalized };
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return { ok: false, status: 503, error: "로그인 식별자 조회 구성이 준비되지 않았습니다." };
  }
  const { data, error } = await sb
    .from("profiles")
    .select("username, email, auth_login_email, provider, auth_provider")
    .eq("username", normalized)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: "로그인 식별자를 확인하지 못했습니다." };
  }
  const row = data as {
    username?: string | null;
    email?: string | null;
    auth_login_email?: string | null;
    provider?: string | null;
    auth_provider?: string | null;
  } | null;
  if (!row) {
    /**
     * profiles 행이 누락/지연된 수동 회원도 로그인 가능하도록
     * 관리자 수동 회원 이메일 규칙으로 폴백한다.
     * 실제 인증 성패는 signInWithPassword에서 최종 판정된다.
     */
    return { ok: true, identifier: resolveManualMemberSignInEmail(trimmed) };
  }
  const authLoginEmail = String(row?.auth_login_email ?? "").trim().toLowerCase();
  if (authLoginEmail) return { ok: true, identifier: authLoginEmail };
  const email = String(row?.email ?? "").trim().toLowerCase();
  if (email) return { ok: true, identifier: email };
  const provider = String(row?.provider ?? row?.auth_provider ?? "").trim().toLowerCase();
  if (provider === "admin_manual") {
    const username = String(row?.username ?? "").trim().toLowerCase();
    if (username) return { ok: true, identifier: buildManualMemberAuthEmail(username) };
  }
  return { ok: true, identifier: resolveManualMemberSignInEmail(trimmed) };
}
