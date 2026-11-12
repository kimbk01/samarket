import { hasActiveAdminMembership } from "@/lib/admin/admin-membership";
import {
  buildManualMemberAuthEmail,
  resolveManualMemberSignInEmail,
} from "@/lib/auth/manual-member-email";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { escapeIlikePatternFragment } from "@/lib/community-messenger/profile-user-search-filter";

export type ResolvedPasswordLoginIdentifier =
  | { ok: true; identifier: string }
  | {
      ok: false;
      status: number;
      error: string;
      code:
        | "identifier_required"
        | "login_identifier_lookup_unconfigured"
        | "login_identifier_lookup_failed";
    };

const SOCIAL_PROVIDER_SET = new Set(["google", "kakao", "naver", "apple"]);

function normalizeProvider(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isSocialOnlyProvider(provider: string): boolean {
  return SOCIAL_PROVIDER_SET.has(provider);
}

type ProfileLoginLookupRow = {
  id?: string | null;
  username?: string | null;
  email?: string | null;
  auth_login_email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
};

type ServiceClient = NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>;

const PROFILE_LOOKUP_COLUMNS = "id, username, email, auth_login_email, provider, auth_provider";

function isManualMemberRow(row: ProfileLoginLookupRow | null | undefined): boolean {
  return (
    normalizeProvider(row?.provider) === "admin_manual" || normalizeProvider(row?.auth_provider) === "admin_manual"
  );
}

/**
 * 관리자 발급 ID — Auth 이메일 `<id>@manual.local` 이 발급 ID 의 고정 기준이다.
 * `profiles.username` 은 자동 디바이 ID 부여로 바뀔 수 있으므로 기준으로 쓰지 않는다.
 * 프로필 1건 + 같은 Auth UID 의 실제 이메일 일치까지 확인된 경우에만 돌려준다.
 */
async function findVerifiedIssuedManualMember(
  sb: ServiceClient,
  issuedEmail: string,
): Promise<ProfileLoginLookupRow | null> {
  const { data, error } = await sb
    .from("profiles")
    .select(PROFILE_LOOKUP_COLUMNS)
    .eq("auth_login_email", issuedEmail)
    .limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  const row = data[0] as ProfileLoginLookupRow;
  const userId = String(row.id ?? "").trim();
  if (!userId || !isManualMemberRow(row)) return null;
  const { data: authData, error: authError } = await sb.auth.admin.getUserById(userId);
  if (authError) return null;
  const authEmail = String(authData?.user?.email ?? "").trim().toLowerCase();
  return authEmail === issuedEmail ? row : null;
}

function pickResolvedIdentifier(row: ProfileLoginLookupRow, fallbackEmail: string): string {
  const authLoginEmail = String(row?.auth_login_email ?? "").trim().toLowerCase();
  if (authLoginEmail) return authLoginEmail;
  const email = String(row?.email ?? "").trim().toLowerCase();
  if (email) return email;
  return fallbackEmail;
}

/**
 * 아이디 로그인 식별자 해석.
 * 없는 아이디·중복·SNS 전용 계정은 응답으로 구분하지 않는다 — 발급 ID 규칙 주소를 돌려주고
 * 비밀번호 검증(`signInWithPassword`)이 일반 「아이디 또는 비밀번호」 오류로 끝나게 한다.
 */
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
  const undisclosed: ResolvedPasswordLoginIdentifier = { ok: true, identifier: directEmailFallback };

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

  if (!lookupByEmail) {
    const issuedEmail = buildManualMemberAuthEmail(normalized);
    const issued = await findVerifiedIssuedManualMember(sb, issuedEmail).catch(() => null);
    if (issued) return { ok: true, identifier: issuedEmail };
  }

  const readRows = async (): Promise<
    { ok: true; rows: ProfileLoginLookupRow[] }
    | { ok: false; errorCode: "login_identifier_lookup_failed" }
  > => {
    if (!lookupByEmail) {
      const { data, error } = await sb
        .from("profiles")
        .select(PROFILE_LOOKUP_COLUMNS)
        .ilike("username", escapeIlikePatternFragment(normalized))
        .limit(2);
      if (error) return { ok: false, errorCode: "login_identifier_lookup_failed" };
      return { ok: true, rows: Array.isArray(data) ? (data as ProfileLoginLookupRow[]) : [] };
    }
    const byAuthLoginEmail = await sb
      .from("profiles")
      .select(PROFILE_LOOKUP_COLUMNS)
      .eq("auth_login_email", normalized)
      .limit(2);
    if (byAuthLoginEmail.error) {
      return { ok: true, rows: [] };
    }
    const authRows = Array.isArray(byAuthLoginEmail.data) ? (byAuthLoginEmail.data as ProfileLoginLookupRow[]) : [];
    if (authRows.length > 0) return { ok: true, rows: authRows };
    const byEmail = await sb.from("profiles").select(PROFILE_LOOKUP_COLUMNS).eq("email", normalized).limit(2);
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
  if (rows.length !== 1) return undisclosed;
  const row = rows[0];
  const provider = normalizeProvider(row?.provider || row?.auth_provider);
  if (isSocialOnlyProvider(provider)) {
    /**
     * CONTRACT: 일반 SNS 회원은 password login 차단.
     * 예외: active admin_memberships 가 있는 내부/운영 계정(예: Kakao 가입 후
     * Super Admin succession 으로 password 가 부여된 계정)은 Auth email 로
     * password login 을 허용한다. provider 문자열만으로 관리자 권한을 주지 않는다.
     */
    const userId = String(row?.id ?? "").trim();
    const allowAdminPasswordLogin =
      userId.length > 0 && (await hasActiveAdminMembership(sb, userId).catch(() => false));
    if (!allowAdminPasswordLogin) return undisclosed;
  }
  const resolvedFromRow = pickResolvedIdentifier(row, directEmailFallback);
  if (resolvedFromRow) return { ok: true, identifier: resolvedFromRow };
  if (isManualMemberRow(row)) {
    const username = String(row?.username ?? "").trim().toLowerCase();
    if (username) return { ok: true, identifier: buildManualMemberAuthEmail(username) };
  }
  return undisclosed;
}
