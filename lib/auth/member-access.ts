import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { MANUAL_MEMBER_EMAIL_DOMAIN } from "@/lib/auth/manual-member-email";
import {
  deriveStoreMemberStatus,
  hasPhilippinePhoneVerification,
  hasStoreTermsConsent,
  normalizeStoreAuthProvider,
  STORE_PHONE_GATE_MESSAGE,
} from "@/lib/auth/store-member-policy";

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
    nickname: meta.nickname ?? meta.full_name,
    username,
    email,
    fallbackId: user.id,
  });

  const oauthAvatar = pickTrimmed(meta.picture) ?? pickTrimmed(meta.avatar_url);
  const preferredLanguage = normalizeAppLanguage(meta.preferred_language);
  const nowIso = new Date().toISOString();
  const isAdminManual = provider === "admin_manual";

  const seedRow = {
    id: user.id,
    email,
    display_name: nickname,
    username,
    nickname,
    auth_login_email: email,
    provider,
    auth_provider: provider,
    avatar_url: oauthAvatar,
    preferred_language: preferredLanguage,
  };

  const { data: existing } = await sb
    .from("profiles")
    .select(
      "id, email, display_name, username, nickname, avatar_url, role, is_admin, member_type, status, member_status, phone, phone_country_code, phone_number, phone_verified, phone_verified_at, phone_verification_status, auth_login_email, provider, auth_provider, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    await sb.from("profiles").upsert({
      ...seedRow,
      role: "user",
      is_admin: false,
      member_type: "normal",
      status: "active",
      member_status: isAdminManual ? "verified_member" : "sns_member",
      phone_country_code: "+63",
      phone_verified: isAdminManual,
      phone_verified_at: isAdminManual ? nowIso : null,
      phone_verification_status: isAdminManual ? "verified" : "unverified",
      phone_verification_method: isAdminManual ? "admin_manual" : null,
    });
  } else {
    const patch: Record<string, unknown> = {};
    if (!pickTrimmed(existing.email) && email) patch.email = email;
    if (!pickTrimmed((existing as { display_name?: string | null }).display_name) && nickname) patch.display_name = nickname;
    if (!pickTrimmed(existing.username) && username) patch.username = username;
    if (!pickTrimmed(existing.nickname) && nickname) patch.nickname = nickname;
    if (!pickTrimmed((existing as { auth_login_email?: string | null }).auth_login_email) && email) patch.auth_login_email = email;
    if (!pickTrimmed((existing as { provider?: string | null }).provider) && provider) patch.provider = provider;
    if (!pickTrimmed(existing.auth_provider) && provider) patch.auth_provider = provider;
    if (!pickTrimmed((existing as { member_status?: string | null }).member_status)) {
      patch.member_status = isAdminManual ? "verified_member" : "sns_member";
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
    if (!exAv && oauthAvatar) patch.avatar_url = oauthAvatar;
    if (Object.keys(patch).length > 0) {
      await sb.from("profiles").update(patch).eq("id", user.id);
    }
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
    privacy_accepted_at: privacyAcceptedAt,
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
