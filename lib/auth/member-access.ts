import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { MANUAL_MEMBER_EMAIL_DOMAIN } from "@/lib/auth/manual-member-email";
import { isSamarketDefaultAvatarUrl, withDefaultAvatar } from "@/lib/profile/default-avatar";
import {
  deriveStoreMemberStatus,
  hasPhilippinePhoneVerification,
  hasStoreTermsConsent,
  normalizeStoreAuthProvider,
  STORE_PHONE_GATE_MESSAGE,
} from "@/lib/auth/store-member-policy";
import { isVerifiedMember } from "@/lib/auth/member-status";

export type MemberAccessState = {
  userId: string;
  email: string | null;
  username: string | null;
  nickname: string;
  /** public.profiles.avatar_url (스토리지 업로드 등 본문 원본) */
  avatarUrl: string | null;
  role: string;
  memberType: string;
  status: string;
  phone: string | null;
  phoneCountryCode?: string | null;
  phoneNumber?: string | null;
  phoneVerified: boolean;
  phoneVerifiedAt?: string | null;
  phoneVerificationStatus: string;
  authLoginEmail?: string | null;
  authProvider: string | null;
  provider?: string | null;
  memberStatus?: string | null;
  isAdmin?: boolean;
  termsAcceptedAt?: string | null;
  termsVersion?: string | null;
  privacyAcceptedAt?: string | null;
  privacyVersion?: string | null;
  storeMemberStatus?: string;
  hasRequiredConsent?: boolean;
};

export const PHONE_VERIFICATION_REQUIRED_MESSAGE =
  STORE_PHONE_GATE_MESSAGE;

function normalizeProvider(provider: string | null | undefined): string | null {
  return normalizeStoreAuthProvider(provider);
}

/**
 * `profiles.provider` / `profiles.auth_provider` 컬럼은
 * `profiles_provider_check` 제약(`'google','kakao','naver','manual','email'`)을 받는다.
 * 정책 코드(`store-member-policy`)는 표시·정책 분기용으로 `'admin_manual'` 을 쓰지만,
 * DB에 그대로 넣으면 제약 위반이 되므로 저장 직전 `'manual'` 로 매핑한다.
 */
function normalizeProviderForDb(provider: string | null | undefined): string | null {
  const normalized = normalizeStoreAuthProvider(provider);
  if (!normalized) return null;
  if (normalized === "admin_manual") return "manual";
  if (
    normalized === "google" ||
    normalized === "kakao" ||
    normalized === "naver" ||
    normalized === "manual" ||
    normalized === "email"
  ) {
    return normalized;
  }
  return "email";
}

function normalizeMemberStatus(status: string | null | undefined): string {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (s === "active") return "verified_user";
  if (s === "blocked") return "suspended";
  if (s === "sns_pending" || s === "verified_user" || s === "suspended" || s === "deleted") return s;
  return "sns_pending";
}

function normalizeMemberRole(role: string | null | undefined): string {
  const r = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (r === "master") return "super_admin";
  if (r === "admin" || r === "super_admin") return r;
  return "user";
}

/**
 * 관리자「회원 수동 입력」으로 만든 계정 — 자가 가입 회원과 동일하게 거래·글쓰기·채팅 등에 참여할 수 있어야 함.
 * (`profiles.auth_provider` 또는 레거시 `@manual.local` Auth 이메일)
 */
export function isAdminProvisionedFormalMemberAuthProvider(authProvider: string | null | undefined): boolean {
  return normalizeProvider(authProvider) === "admin_manual";
}

export function isAdminProvisionedFormalMemberSignals(input: {
  authProvider?: string | null;
  email?: string | null;
}): boolean {
  if (isAdminProvisionedFormalMemberAuthProvider(input.authProvider)) return true;
  const email = (input.email ?? "").trim().toLowerCase();
  return email.endsWith(`@${MANUAL_MEMBER_EMAIL_DOMAIN}`);
}

/**
 * 전화 인증을 요구하지 않아도 되는지 — `phone_verified === false` 인 경우에도 관리자 수동 정식 회원이면 true.
 * (`phone_verified` 미수집(undefined)일 때는 호출하지 말고 상위에서 프로필 확정 후 판단)
 */
export function bypassesPhilippinePhoneVerificationGate(input: {
  role?: string | null;
  phone_verified: boolean;
  phone_verified_at?: string | null;
  auth_provider?: string | null;
  provider?: string | null;
  email?: string | null;
}): boolean {
  return hasPhilippinePhoneVerification({
    role: input.role,
    phone_verified: input.phone_verified,
    phone_verified_at: input.phone_verified_at ?? null,
    provider: input.provider ?? input.auth_provider ?? null,
    auth_provider: input.auth_provider ?? null,
    email: input.email ?? null,
  });
}

/**
 * UI·표시용: OAuth·이메일 가입 뒤 SMS 인증 완료와 동일한「연락처 정식」지위.
 * 관리자 수동 입력 정식 회원(`manual_admin`·`@manual.local`)도 SMS 없이 동등하게 표시한다.
 */
export function hasFormalMemberContactVerification(input: {
  phone_verified: boolean;
  phone_verified_at?: string | null;
  auth_provider?: string | null;
  provider?: string | null;
  email?: string | null;
}): boolean {
  return hasPhilippinePhoneVerification({
    phone_verified: input.phone_verified,
    phone_verified_at: input.phone_verified_at ?? null,
    provider: input.provider ?? input.auth_provider ?? null,
    auth_provider: input.auth_provider ?? null,
    email: input.email ?? null,
  });
}

function pickTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readFirstIdentityDataValue(user: User, keys: string[]): string | null {
  const identities = Array.isArray(user.identities)
    ? (user.identities as unknown as Array<{ identity_data?: Record<string, unknown> | null }>)
    : [];
  for (const identity of identities) {
    const data = identity.identity_data;
    if (!data || typeof data !== "object") continue;
    for (const key of keys) {
      const value = pickTrimmed(data[key]);
      if (value) return value;
    }
  }
  return null;
}

function resolveOAuthAvatarUrl(user: User, meta: Record<string, unknown>): string | null {
  return (
    pickTrimmed(meta.picture) ??
    pickTrimmed(meta.avatar_url) ??
    pickTrimmed(meta.photo_url) ??
    pickTrimmed(meta.image) ??
    readFirstIdentityDataValue(user, ["picture", "avatar_url", "photo_url", "image"])
  );
}

export function resolveNicknameSeed(input: {
  nickname?: unknown;
  username?: unknown;
  email?: unknown;
  fallbackId?: unknown;
}): string {
  const nickname = pickTrimmed(input.nickname);
  if (nickname) return nickname;
  const username = pickTrimmed(input.username);
  if (username) return username;
  const email = pickTrimmed(input.email);
  if (email) return email.split("@")[0] || email;
  const fallbackId = pickTrimmed(input.fallbackId);
  return fallbackId ? fallbackId.slice(0, 8) : "user";
}

/**
 * 닉네임 unique 정책(`profiles_nickname_lower_unique_idx`)을 사전 충족시키기 위한 헬퍼.
 * - SNS 기본 닉네임이 이미 사용 중이면 `BK KIM`, `BK KIM2`, `BK KIM3` … 으로 suffix 부여.
 * - 본인(`ownerId`) 의 행이라면 충돌 아님.
 * - DB 조회 실패·컬럼 부재 등 예외는 silent — 원본 후보 그대로 반환(이후 insert 가 unique 위반 시 fallback path 가 처리).
 */
async function resolveUniqueNicknameForInsert(
  sb: SupabaseClient,
  candidate: string,
  ownerId: string
): Promise<string> {
  const base = (candidate ?? "").trim();
  if (!base) return base;
  const tryName = async (name: string): Promise<boolean> => {
    try {
      const { data, error } = await sb
        .from("profiles")
        .select("id")
        .ilike("nickname", name)
        .limit(2);
      if (error || !Array.isArray(data)) return true;
      const taken = data.find((row) => {
        const rid = (row as { id?: unknown }).id;
        return typeof rid === "string" && rid !== ownerId;
      });
      return !taken;
    } catch {
      return true;
    }
  };
  if (await tryName(base)) return base;
  for (let i = 2; i <= 50; i += 1) {
    const trimmed = base.length > 18 ? base.slice(0, 18) : base;
    const candidateName = `${trimmed}${i}`;
    if (await tryName(candidateName)) return candidateName;
  }
  return `${base.slice(0, 12)}-${ownerId.slice(0, 6)}`;
}

export async function ensureAuthProfileRow(
  sb: SupabaseClient,
  user: User
): Promise<MemberAccessState> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const provider =
    normalizeProvider(pickTrimmed(user.app_metadata?.provider) ?? pickTrimmed(meta.provider) ?? pickTrimmed(meta.auth_provider)) ??
    "email";
  const email = pickTrimmed(user.email);
  const username =
    pickTrimmed(meta.username) ??
    pickTrimmed(meta.login_id) ??
    (email ? email.split("@")[0] : null);
  const nickname = resolveNicknameSeed({
    nickname: meta.nickname ?? meta.full_name ?? meta.name,
    username,
    email,
    fallbackId: user.id,
  });

  const oauthAvatarRaw = resolveOAuthAvatarUrl(user, meta);
  const oauthAvatar = withDefaultAvatar(oauthAvatarRaw);
  const preferredLanguage = normalizeAppLanguage(meta.preferred_language);
  const nowIso = new Date().toISOString();
  const isAdminManual = provider === "admin_manual";
  const dbProvider = normalizeProviderForDb(provider) ?? "email";

  /**
   * `profiles_status_check` (마이그레이션 `20260426030000`) 호환:
   * 허용값은 `('sns_pending', 'verified_user', 'suspended', 'deleted')` 뿐.
   * 관리자 수동 정식 회원은 SMS 없이도 거래 가능 → `verified_user`,
   * 그 외 SNS·이메일 신규는 전화 인증 전 단계 → `sns_pending`.
   */
  const dbStatus: "verified_user" | "sns_pending" = isAdminManual ? "verified_user" : "sns_pending";

  const { data: existing } = await sb
    .from("profiles")
    .select(
      "id, email, display_name, username, nickname, avatar_url, role, is_admin, member_type, status, member_status, phone, phone_country_code, phone_number, phone_verified, phone_verified_at, phone_verification_status, auth_login_email, provider, auth_provider, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version"
    )
    .eq("id", user.id)
    .maybeSingle();

  /**
   * 닉네임 unique 보장은 비싸므로 **실제로 닉네임을 기록할 때만** 평가한다.
   * - 신규 행: 항상 필요 (insert 의 nickname/display_name)
   * - 기존 행: nickname/display_name 가 둘 다 비어 있을 때만 (update patch)
   * 그 외(이미 닉네임이 채워진 기존 회원의 재로그인) 는 추가 쿼리 0건.
   */
  let uniqueNicknameCache: string | null = null;
  const ensureUniqueNickname = async (): Promise<string> => {
    if (uniqueNicknameCache != null) return uniqueNicknameCache;
    uniqueNicknameCache = await resolveUniqueNicknameForInsert(sb, nickname, user.id);
    return uniqueNicknameCache;
  };

  if (!existing) {
    const insertNickname = await ensureUniqueNickname();
    const seedRow = {
      id: user.id,
      email,
      display_name: insertNickname,
      username,
      nickname: insertNickname,
      auth_login_email: email,
      provider: dbProvider,
      auth_provider: dbProvider,
      avatar_url: oauthAvatar,
      preferred_language: preferredLanguage,
    };
    const fullRow = {
      ...seedRow,
      role: "user",
      is_admin: false,
      member_type: "normal",
      status: dbStatus,
      member_status: isAdminManual ? "active" : "pending",
      phone_country_code: "+63",
      phone_verified: isAdminManual,
      phone_verified_at: isAdminManual ? nowIso : null,
      phone_verification_status: isAdminManual ? "verified" : "unverified",
      phone_verification_method: isAdminManual ? "admin_manual" : null,
      updated_at: nowIso,
    };
    const { error: upsertError } = await sb
      .from("profiles")
      .upsert(fullRow, { onConflict: "id" });
    if (upsertError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ensureAuthProfileRow] full upsert failed → minimal fallback", {
          message: upsertError.message,
          userId: user.id,
        });
      }
      /**
       * 제약·트리거·미적용 마이그레이션 등으로 전체 행이 거부될 수 있다.
       * 어떤 스키마라도 통과하는 최소 컬럼만 다시 시도하고, 그것도 실패하면
       * id 만으로 마지막 시도(모든 NOT NULL 컬럼은 DEFAULT 가 있으므로 id 만으로 INSERT 가능).
       */
      const minimalRow = {
        id: user.id,
        email,
        display_name: insertNickname,
        nickname: insertNickname,
        avatar_url: oauthAvatar,
        updated_at: nowIso,
      };
      const second = await sb.from("profiles").upsert(minimalRow, { onConflict: "id" });
      if (second.error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ensureAuthProfileRow] minimal upsert failed → id-only fallback", {
            message: second.error.message,
            userId: user.id,
          });
        }
        const idOnly = await sb.from("profiles").upsert({ id: user.id }, { onConflict: "id" });
        if (idOnly.error) {
          const verify = await sb
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();
          if (!verify.data) {
            throw new Error(
              `${upsertError.message ?? "profile_upsert_failed"} | minimal: ${second.error.message ?? "minimal_upsert_failed"} | id_only: ${idOnly.error.message ?? "id_only_upsert_failed"}`
            );
          }
        }
      }
    }
  } else {
    const patch: Record<string, unknown> = {};
    if (!pickTrimmed(existing.email) && email) patch.email = email;
    const needsDisplayName = !pickTrimmed((existing as { display_name?: string | null }).display_name) && Boolean(nickname);
    const needsNickname = !pickTrimmed(existing.nickname) && Boolean(nickname);
    if (needsDisplayName) patch.display_name = await ensureUniqueNickname();
    if (!pickTrimmed(existing.username) && username) patch.username = username;
    if (needsNickname) patch.nickname = await ensureUniqueNickname();
    if (!pickTrimmed((existing as { auth_login_email?: string | null }).auth_login_email) && email) patch.auth_login_email = email;
    if (!pickTrimmed((existing as { provider?: string | null }).provider) && dbProvider) patch.provider = dbProvider;
    if (!pickTrimmed(existing.auth_provider) && dbProvider) patch.auth_provider = dbProvider;
    if (!pickTrimmed((existing as { member_status?: string | null }).member_status)) {
      patch.member_status = isAdminManual ? "active" : "pending";
    }
    if (isAdminManual && (existing.phone_verified !== true || !pickTrimmed((existing as { phone_verified_at?: string | null }).phone_verified_at))) {
      patch.phone_verified = true;
      patch.phone_verified_at = nowIso;
      patch.phone_verification_status = "verified";
      patch.phone_verification_method = "admin_manual";
    }
    if (!pickTrimmed((existing as { preferred_language?: string | null }).preferred_language) && preferredLanguage) {
      patch.preferred_language = preferredLanguage;
    }
    const exAv = pickTrimmed(existing.avatar_url);
    if (oauthAvatarRaw && (!exAv || isSamarketDefaultAvatarUrl(exAv))) patch.avatar_url = oauthAvatarRaw;
    if (!exAv && !oauthAvatarRaw) patch.avatar_url = oauthAvatar;
    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await sb.from("profiles").update(patch).eq("id", user.id);
      if (updateError) {
        /**
         * `guard_profiles_self_update` 트리거 (사용자 클라이언트가 provider/status/role 변경 시 차단)
         * 또는 마이그레이션 미적용 환경에서 update 가 막힐 수 있다.
         * 기존 행이 있으므로 업데이트 실패는 회원 가입을 막는 fatal 이 아니다 — 경고만 남기고 진행.
         */
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ensureAuthProfileRow] enrichment update skipped", {
            message: updateError.message,
            userId: user.id,
          });
        }
      }
    }
  }

  const verifiedProfile = await sb
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (verifiedProfile.error || !verifiedProfile.data) {
    throw new Error(verifiedProfile.error?.message || "profile_verify_failed");
  }

  return await loadMemberAccessState(sb, user.id, {
    fallbackEmail: email,
    fallbackUsername: username,
    fallbackNickname: nickname,
    fallbackProvider: provider,
  });
}

export async function loadMemberAccessState(
  sb: SupabaseClient,
  userId: string,
  opts?: {
    fallbackEmail?: string | null;
    fallbackUsername?: string | null;
    fallbackNickname?: string | null;
    fallbackProvider?: string | null;
  }
): Promise<MemberAccessState> {
  const { data: profile } = await sb
    .from("profiles")
    .select(
      "id, email, display_name, username, nickname, avatar_url, role, is_admin, member_type, status, member_status, phone, phone_country_code, phone_number, phone_verified, phone_verified_at, phone_verification_status, auth_login_email, provider, auth_provider, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version"
    )
    .eq("id", userId)
    .maybeSingle();

  const email = pickTrimmed(profile?.email) ?? opts?.fallbackEmail ?? null;
  const username = pickTrimmed(profile?.username) ?? opts?.fallbackUsername ?? null;
  const nickname = resolveNicknameSeed({
    nickname: profile?.display_name ?? profile?.nickname ?? opts?.fallbackNickname,
    username,
    email,
    fallbackId: userId,
  });
  const role = normalizeMemberRole(pickTrimmed(profile?.role) ?? "user");
  const memberType =
    pickTrimmed(profile?.member_type) ??
    (isPrivilegedAdminRole(role) ? "admin" : "normal");
  const status = normalizeMemberStatus(pickTrimmed(profile?.status));
  const phoneCountryCode = pickTrimmed((profile as { phone_country_code?: string | null } | null)?.phone_country_code) ?? "+63";
  const phoneNumber = pickTrimmed((profile as { phone_number?: string | null } | null)?.phone_number);
  const phone =
    pickTrimmed(profile?.phone) ??
    (phoneNumber ? `${phoneCountryCode}${phoneNumber}` : null);
  const phoneVerifiedAt = pickTrimmed((profile as { phone_verified_at?: string | null } | null)?.phone_verified_at);
  const phoneVerified = profile?.phone_verified === true || Boolean(phoneVerifiedAt);
  const authLoginEmail = pickTrimmed((profile as { auth_login_email?: string | null } | null)?.auth_login_email);
  const memberStatus = pickTrimmed((profile as { member_status?: string | null } | null)?.member_status);
  const isAdmin = (profile as { is_admin?: boolean | null } | null)?.is_admin === true;
  const phoneVerificationStatus =
    pickTrimmed(profile?.phone_verification_status) ??
    (phoneVerified ? "verified" : phone ? "pending" : "unverified");
  const authProvider =
    normalizeProvider(pickTrimmed((profile as { provider?: string | null } | null)?.provider) ?? pickTrimmed(profile?.auth_provider)) ??
    normalizeProvider(opts?.fallbackProvider) ??
    null;
  const avatarUrl = pickTrimmed((profile as { avatar_url?: string | null } | null)?.avatar_url);
  const termsAcceptedAt = pickTrimmed((profile as { terms_accepted_at?: string | null } | null)?.terms_accepted_at);
  const termsVersion = pickTrimmed((profile as { terms_version?: string | null } | null)?.terms_version);
  const privacyAcceptedAt = pickTrimmed((profile as { privacy_accepted_at?: string | null } | null)?.privacy_accepted_at);
  const privacyVersion = pickTrimmed((profile as { privacy_version?: string | null } | null)?.privacy_version);
  const storeMemberStatus = deriveStoreMemberStatus({
    role,
    status,
    member_status: memberStatus,
    phone_verified: phoneVerified,
    phone_verified_at: phoneVerifiedAt,
    provider: authProvider,
    auth_provider: authProvider,
    email,
  });
  const hasRequiredConsent = hasStoreTermsConsent({
    terms_accepted_at: termsAcceptedAt,
    terms_version: termsVersion,
    privacy_accepted_at: privacyAcceptedAt,
    privacy_version: privacyVersion,
  });

  return {
    userId,
    email,
    username,
    nickname,
    avatarUrl,
    role,
    memberType,
    status,
    phone,
    phoneCountryCode,
    phoneNumber,
    phoneVerified,
    phoneVerifiedAt,
    phoneVerificationStatus,
    authLoginEmail,
    authProvider,
    provider: authProvider,
    memberStatus,
    isAdmin,
    termsAcceptedAt,
    termsVersion,
    privacyAcceptedAt,
    privacyVersion,
    storeMemberStatus,
    hasRequiredConsent,
  };
}

export function canUseVerifiedMemberFeatures(state: MemberAccessState | null | undefined): boolean {
  if (!state) return false;
  if (isPrivilegedAdminRole(state.role)) return true;
  if (isVerifiedMember({ phone_verified: state.phoneVerified, member_status: state.memberStatus ?? null })) {
    return true;
  }
  if (
    state.storeMemberStatus !== "verified_member" &&
    state.storeMemberStatus !== "admin_manual" &&
    state.storeMemberStatus !== "admin"
  ) {
    return false;
  }
  return hasPhilippinePhoneVerification({
    role: state.role,
    phone_verified: state.phoneVerified,
    phone_verified_at: state.phoneVerifiedAt ?? null,
    provider: state.provider ?? state.authProvider ?? null,
    auth_provider: state.authProvider,
    email: state.email,
  });
}

export async function assertVerifiedMemberForAction(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; state: MemberAccessState } | { ok: false; status: number; error: string; state?: MemberAccessState }> {
  const state = await loadMemberAccessState(sb, userId);
  if (state.status === "suspended" || state.status === "deleted") {
    return { ok: false, status: 403, error: "이 회원은 현재 활동이 제한되어 있습니다.", state };
  }
  if (!canUseVerifiedMemberFeatures(state)) {
    return { ok: false, status: 403, error: PHONE_VERIFICATION_REQUIRED_MESSAGE, state };
  }
  return { ok: true, state };
}
