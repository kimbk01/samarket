import {
  buildManualMemberAuthEmail,
  resolveManualMemberSignInEmail,
} from "@/lib/auth/manual-member-email";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type ResolvedPasswordLoginIdentifier =
  | { ok: true; identifier: string }
  | {
      ok: false;
      status: number;
      error: string;
      code:
        | "identifier_required"
        | "login_identifier_not_found"
        | "login_identifier_lookup_unconfigured"
        | "login_identifier_lookup_failed"
        | "login_identifier_conflict"
        | "password_login_blocked_for_social_account";
    };

const SOCIAL_PROVIDER_SET = new Set(["google", "kakao", "naver", "apple", "facebook"]);

function normalizeProvider(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isSocialOnlyProvider(provider: string): boolean {
  return SOCIAL_PROVIDER_SET.has(provider);
}

type ProfileLoginLookupRow = {
  username?: string | null;
  email?: string | null;
  auth_login_email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
};

function pickResolvedIdentifier(row: ProfileLoginLookupRow, fallbackEmail: string): string {
  const authLoginEmail = String(row?.auth_login_email ?? "").trim().toLowerCase();
  if (authLoginEmail) return authLoginEmail;
  const email = String(row?.email ?? "").trim().toLowerCase();
  if (email) return email;
  return fallbackEmail;
}

export async function resolvePasswordLoginIdentifier(raw: string): Promise<ResolvedPasswordLoginIdentifier> {
  const trimmed = raw.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      error: "이메일 또는 아이디를 입력하세요.",
      code: "identifier_required",
    };
  }
  const lookupByEmail = normalized.includes("@");

  /**
   * 이메일 입력은 Auth 로그인 식별자로 바로 사용할 수 있다.
   * profiles 조회 실패/지연이 있어도 이메일 비밀번호 로그인 자체가 막히지 않아야 한다.
   */
  const directEmailFallback = lookupByEmail ? normalized : resolveManualMemberSignInEmail(trimmed);

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    if (lookupByEmail) return { ok: true, identifier: normalized };
    return {
      ok: false,
      status: 503,
      error: "로그인 식별자 조회 구성이 준비되지 않았습니다.",
      code: "login_identifier_lookup_unconfigured",
    };
  }
  const baseQuery = sb
    .from("profiles")
    .select("username, email, auth_login_email, provider, auth_provider");
  const fetchByUsername = async () => {
    return await baseQuery
      .ilike("username", normalized)
      .limit(2);
  };
  const fetchByAuthLoginEmail = async () => {
    return await baseQuery
      .eq("auth_login_email", normalized)
      .limit(2);
  };
  const fetchByEmail = async () => {
    return await baseQuery
      .eq("email", normalized)
      .limit(2);
  };

  const readRows = async (): Promise<
    { ok: true; rows: ProfileLoginLookupRow[] }
    | { ok: false; errorCode: "login_identifier_lookup_failed" }
  > => {
    if (!lookupByEmail) {
      const { data, error } = await fetchByUsername();
      if (error) return { ok: false, errorCode: "login_identifier_lookup_failed" };
      return { ok: true, rows: Array.isArray(data) ? (data as ProfileLoginLookupRow[]) : [] };
    }
    const byAuthLoginEmail = await fetchByAuthLoginEmail();
    if (byAuthLoginEmail.error) {
      return { ok: true, rows: [] };
    }
    const authRows = Array.isArray(byAuthLoginEmail.data) ? (byAuthLoginEmail.data as ProfileLoginLookupRow[]) : [];
    if (authRows.length > 0) return { ok: true, rows: authRows };
    const byEmail = await fetchByEmail();
    if (byEmail.error) {
      return { ok: true, rows: [] };
    }
    return { ok: true, rows: Array.isArray(byEmail.data) ? (byEmail.data as ProfileLoginLookupRow[]) : [] };
  };

  const loaded = await readRows();
  if (!loaded.ok) {
    if (lookupByEmail) return { ok: true, identifier: normalized };
    return {
      ok: false,
      status: 500,
      error: "로그인 식별자를 확인하지 못했습니다.",
      code: loaded.errorCode,
    };
  }

  const rows = loaded.rows;
  if (rows.length > 1) {
    return {
      ok: false,
      status: 409,
      error: "로그인 아이디가 중복되어 확인이 필요합니다. 관리자에게 문의해 주세요.",
      code: "login_identifier_conflict",
    };
  }
  const row = rows[0] ?? null;
  if (!row) {
    if (!lookupByEmail) {
      return {
        ok: false,
        status: 404,
        error: "입력한 로그인 아이디를 찾을 수 없습니다.",
        code: "login_identifier_not_found",
      };
    }
    /**
     * profiles 행이 누락/지연된 수동 회원도 로그인 가능하도록
     * 관리자 수동 회원 이메일 규칙으로 폴백한다.
     * 실제 인증 성패는 signInWithPassword에서 최종 판정된다.
     */
    return {
      ok: true,
      identifier: directEmailFallback,
    };
  }
  const provider = normalizeProvider(row?.provider || row?.auth_provider);
  if (isSocialOnlyProvider(provider)) {
    return {
      ok: false,
      status: 400,
      error: "이 계정은 SNS 전용 계정입니다. 아래 SNS 로그인 버튼으로 로그인해 주세요.",
      code: "password_login_blocked_for_social_account",
    };
  }
  const resolvedFromRow = pickResolvedIdentifier(row, directEmailFallback);
  if (resolvedFromRow) return { ok: true, identifier: resolvedFromRow };
  if (provider === "admin_manual") {
    const username = String(row?.username ?? "").trim().toLowerCase();
    if (username) return { ok: true, identifier: buildManualMemberAuthEmail(username) };
  }
  return { ok: true, identifier: directEmailFallback };
}
