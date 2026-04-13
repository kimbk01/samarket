import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { MANUAL_MEMBER_EMAIL_DOMAIN } from "@/lib/auth/manual-member-email";

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
  phoneVerified: boolean;
  phoneVerificationStatus: string;
  authProvider: string | null;
};

export const PHONE_VERIFICATION_REQUIRED_MESSAGE =
  "필리핀 전화번호 인증이 완료되어야 글쓰기, 거래, 주문, 채팅을 사용할 수 있습니다.";

const ADMIN_PROVISIONED_AUTH_PROVIDERS = new Set(["manual_admin", "manual_admin_backfill"]);

/**
 * 관리자「회원 수동 입력」으로 만든 계정 — 자가 가입 회원과 동일하게 거래·글쓰기·채팅 등에 참여할 수 있어야 함.
 * (`profiles.auth_provider` 또는 레거시 `@manual.local` Auth 이메일)
 */
export function isAdminProvisionedFormalMemberAuthProvider(authProvider: string | null | undefined): boolean {
  const p = typeof authProvider === "string" ? authProvider.trim().toLowerCase() : "";
  return ADMIN_PROVISIONED_AUTH_PROVIDERS.has(p);
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
  auth_provider?: string | null;
  email?: string | null;
}): boolean {
  if (input.role === "admin" || input.role === "master") return true;
  if (input.phone_verified === true) return true;
  return isAdminProvisionedFormalMemberSignals({
    authProvider: input.auth_provider ?? null,
    email: input.email ?? null,
  });
}

/**
 * UI·표시용: OAuth·이메일 가입 뒤 SMS 인증 완료와 동일한「연락처 정식」지위.
 * 관리자 수동 입력 정식 회원(`manual_admin`·`@manual.local`)도 SMS 없이 동등하게 표시한다.
 */
export function hasFormalMemberContactVerification(input: {
  phone_verified: boolean;
  auth_provider?: string | null;
  email?: string | null;
}): boolean {
  if (input.phone_verified) return true;
  return isAdminProvisionedFormalMemberSignals({
    authProvider: input.auth_provider ?? null,
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
  const provider = pickTrimmed(user.app_metadata?.provider) ?? pickTrimmed(meta.auth_provider) ?? "email";
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

  const seedRow = {
    id: user.id,
    email,
    username,
    nickname,
    auth_provider: provider,
    avatar_url: oauthAvatar,
    preferred_language: preferredLanguage,
  };

  const { data: existing } = await sb
    .from("profiles")
    .select(
      "id, email, username, nickname, avatar_url, role, member_type, status, phone, phone_verified, phone_verification_status, auth_provider"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    await sb.from("profiles").upsert({
      ...seedRow,
      role: "user",
      member_type: "normal",
      status: "active",
      phone_verified: false,
      phone_verification_status: "unverified",
    });
  } else {
    const patch: Record<string, unknown> = {};
    if (!pickTrimmed(existing.email) && email) patch.email = email;
    if (!pickTrimmed(existing.username) && username) patch.username = username;
    if (!pickTrimmed(existing.nickname) && nickname) patch.nickname = nickname;
    if (!pickTrimmed(existing.auth_provider) && provider) patch.auth_provider = provider;
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
  const [{ data: profile }, { data: testUser }] = await Promise.all([
    sb
      .from("profiles")
      .select(
        "id, email, username, nickname, avatar_url, role, member_type, status, phone, phone_verified, phone_verification_status, auth_provider"
      )
      .eq("id", userId)
      .maybeSingle(),
    sb
      .from("test_users")
      .select("id, username, role, display_name, contact_phone")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const email = pickTrimmed(profile?.email) ?? opts?.fallbackEmail ?? null;
  const username = pickTrimmed(profile?.username) ?? pickTrimmed(testUser?.username) ?? opts?.fallbackUsername ?? null;
  const nickname = resolveNicknameSeed({
    nickname: profile?.nickname ?? testUser?.display_name ?? opts?.fallbackNickname,
    username,
    email,
    fallbackId: userId,
  });
  const role = pickTrimmed(profile?.role) ?? pickTrimmed(testUser?.role) ?? "user";
  const memberType =
    pickTrimmed(profile?.member_type) ??
    (role === "special" ? "premium" : role === "admin" || role === "master" ? "admin" : "normal");
  const status = pickTrimmed(profile?.status) ?? "active";
  const phone = pickTrimmed(profile?.phone) ?? pickTrimmed(testUser?.contact_phone) ?? null;
  const phoneVerified = profile?.phone_verified === true;
  const phoneVerificationStatus =
    pickTrimmed(profile?.phone_verification_status) ??
    (phoneVerified ? "verified" : phone ? "pending" : "unverified");
  const authProvider = pickTrimmed(profile?.auth_provider) ?? opts?.fallbackProvider ?? null;
  const avatarUrl = pickTrimmed((profile as { avatar_url?: string | null } | null)?.avatar_url);

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
    phoneVerified,
    phoneVerificationStatus,
    authProvider,
  };
}

export function canUseVerifiedMemberFeatures(state: MemberAccessState | null | undefined): boolean {
  if (!state) return false;
  if (state.role === "admin" || state.role === "master") return true;
  if (state.status !== "active") return false;
  if (state.phoneVerified) return true;
  return isAdminProvisionedFormalMemberSignals({
    authProvider: state.authProvider,
    email: state.email,
  });
}

export async function assertVerifiedMemberForAction(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; state: MemberAccessState } | { ok: false; status: number; error: string; state?: MemberAccessState }> {
  const state = await loadMemberAccessState(sb, userId);
  if (state.status !== "active") {
    return { ok: false, status: 403, error: "이 회원은 현재 활동이 제한되어 있습니다.", state };
  }
  if (!canUseVerifiedMemberFeatures(state)) {
    /** 비프로덕션: 레거시 로컬 test_users(순수 테스트 로그인)만 전화 인증 생략 */
    if (!isProductionDeploy()) {
      const { data: tu } = await sb.from("test_users").select("id").eq("id", userId).maybeSingle();
      if (tu && typeof (tu as { id?: string }).id === "string") {
        return { ok: true, state };
      }
    }
    return { ok: false, status: 403, error: PHONE_VERIFICATION_REQUIRED_MESSAGE, state };
  }
  return { ok: true, state };
}
