/**
 * 어드민 회원 목록 전용 — 로그인 아이디·연락 이메일·SNS provider id (read-only).
 * Supabase Auth 내부 synthetic email 은 운영 표시에서 후순위/제외한다.
 *
 * ## 어드민 표시 정책 (가입수단별)
 *
 * | 수단 | 로그인 아이디 열 | 이메일 열 |
 * |------|------------------|-----------|
 * | Google | 실제 Gmail (`auth_login_email` 등) 우선 | 동일 (연락 가능 이메일) |
 * | Kakao | 카카오 numeric ID (`provider_user_id`) — 이메일 없을 때 | 카카오가 이메일을 준 경우만 (`hasEmailFromProfile` → `auth_login_email`) |
 * | Apple | Apple `sub` (`provider_user_id`) — 표시 이메일 없을 때 | 사용자가 실제 이메일을 공유한 경우만 (Hide My Email·Private Relay 제외) |
 * | Email | 실제 가입 이메일 | 동일 |
 * | Manual | 수동 아이디 (`@manual.local` 접미사 제거) | 프로필 연락 이메일 |
 *
 * **카카오 이메일이 비는 이유 (버그 아님):** 카카오는 동의·scope 없으면 이메일을 주지 않는다.
 * Auth 내부 `kakao.{id}@kakao.native.dibay.internal` 은 세션용이며 어드민에 노출하지 않는다.
 *
 * **동일 카카오/구글 유저가 다르게 보이던 이유:** 레거시 profiles.email 에 synthetic 이
 * 들어가 있거나 auth_provider 가 비어 있으면 예전엔 「이메일」 가입으로 분류됐다.
 * 현재는 synthetic·provider_user_id·linked identity 로 **동일 규칙**을 적용한다.
 */

import { MANUAL_MEMBER_EMAIL_SUFFIX } from "@/lib/auth/manual-member-email";
import {
  inferProviderUserIdFromSyntheticAuthEmail,
  isDibaySyntheticAuthEmail,
  pickContactEmailForProfile,
} from "@/lib/auth/synthetic-auth-email";
import type { AdminAuthListUser } from "@/lib/admin-users/resolve-admin-auth-provider";
import type { AdminAuthProvider } from "@/lib/types/admin-user";

export { inferProviderUserIdFromSyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";

export type AdminLinkedIdentity = {
  provider: string;
  providerUserId: string;
  email: string | null;
};

export type AdminDisplayProfile = {
  email?: string | null;
  auth_login_email?: string | null;
  username?: string | null;
  provider_user_id?: string | null;
};

export type AdminDisplayTestUser = {
  username?: string | null;
};

const SNS_PROVIDERS = ["google", "kakao", "apple", "naver", "facebook"] as const;

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Auth 내부용 주소 — 어드민 연락 이메일·로그인 아이디 1순위에서 제외 */
export function isAdminSyntheticAuthEmail(email: string | null | undefined): boolean {
  return isDibaySyntheticAuthEmail(email);
}

function firstDisplayEmail(...candidates: Array<string | null | undefined>): string | null {
  return pickContactEmailForProfile(...candidates);
}

function snsIdentity(authUser: AdminAuthListUser | null | undefined, provider: AdminAuthProvider) {
  const identities = Array.isArray(authUser?.identities) ? authUser.identities : [];
  return identities.find((row) => String(row.provider ?? "").toLowerCase() === provider) ?? null;
}

function allIdentityEmails(authUser: AdminAuthListUser | null | undefined): string[] {
  const identities = Array.isArray(authUser?.identities) ? authUser.identities : [];
  const out: string[] = [];
  for (const identity of identities) {
    const data = identity.identity_data;
    const email = firstDisplayEmail(pickString(data?.email));
    if (email) out.push(email);
  }
  return out;
}

function metadataProviderUserId(
  authUser: AdminAuthListUser | null | undefined,
  provider: AdminAuthProvider,
): string | null {
  const meta = authUser?.user_metadata ?? {};
  if (provider === "google") return pickString(meta.google_id);
  if (provider === "kakao") return pickString(meta.kakao_id) ?? pickString(meta.id);
  if (provider === "apple") {
    return pickString(meta.apple_sub) ?? pickString(meta.sub) ?? pickString(meta.apple_id);
  }
  return null;
}

function metadataEmailHint(authUser: AdminAuthListUser | null | undefined): string | null {
  const meta = authUser?.user_metadata ?? {};
  return firstDisplayEmail(
    pickString(meta.google_email_hint),
    pickString(meta.kakao_email_hint),
    pickString(meta.email),
  );
}

function linkedIdentityForProvider(
  linkedIdentities: readonly AdminLinkedIdentity[] | null | undefined,
  provider: AdminAuthProvider,
): AdminLinkedIdentity | null {
  if (!linkedIdentities?.length) return null;
  const match = linkedIdentities.find((row) => String(row.provider).toLowerCase() === provider);
  return match ?? null;
}

function identityProviderUserId(
  authUser: AdminAuthListUser | null | undefined,
  provider: AdminAuthProvider,
): string | null {
  const identity = snsIdentity(authUser, provider);
  const data = identity?.identity_data;
  return (
    pickString(data?.sub) ??
    pickString(data?.provider_id) ??
    pickString(data?.id) ??
    pickString(identity?.id)
  );
}

export function resolveAdminProviderUserId(input: {
  provider: AdminAuthProvider;
  authUser?: AdminAuthListUser | null;
  profile?: AdminDisplayProfile | null;
  linkedIdentities?: readonly AdminLinkedIdentity[] | null;
}): string | undefined {
  const linked = linkedIdentityForProvider(input.linkedIdentities, input.provider);
  const fromProfile = pickString(input.profile?.provider_user_id);
  const fromLinked = pickString(linked?.providerUserId);
  const fromMeta = metadataProviderUserId(input.authUser, input.provider);
  const fromIdentity = identityProviderUserId(input.authUser, input.provider);
  const fromSynthetic = inferProviderUserIdFromSyntheticAuthEmail(input.authUser?.email);

  return (
    fromProfile ??
    fromLinked ??
    fromMeta ??
    fromIdentity ??
    fromSynthetic ??
    undefined
  );
}

/** 어드민 「이메일」 열 — synthetic 제외, 연락 가능 이메일만 */
export function resolveAdminDisplayEmail(input: {
  authUser?: AdminAuthListUser | null;
  profile?: AdminDisplayProfile | null;
  linkedIdentities?: readonly AdminLinkedIdentity[] | null;
  provider?: AdminAuthProvider;
}): string | undefined {
  const linkedEmails = (input.linkedIdentities ?? [])
    .map((row) => firstDisplayEmail(row.email))
    .filter((value): value is string => Boolean(value));

  const preferredLinked =
    input.provider && input.provider !== "email" && input.provider !== "manual" && input.provider !== "unknown"
      ? firstDisplayEmail(linkedIdentityForProvider(input.linkedIdentities, input.provider)?.email)
      : null;

  const display = firstDisplayEmail(
    input.profile?.auth_login_email,
    preferredLinked,
    input.profile?.email,
    metadataEmailHint(input.authUser),
    ...allIdentityEmails(input.authUser),
    ...linkedEmails,
    input.authUser?.email,
  );

  return display ?? undefined;
}

function manualLoginIdentifier(input: {
  authUser?: AdminAuthListUser | null;
  profile?: AdminDisplayProfile | null;
  testUser?: AdminDisplayTestUser | null;
}): string {
  const fromTest = pickString(input.testUser?.username);
  if (fromTest) return fromTest;

  const fromProfileUsername = pickString(input.profile?.username);
  if (fromProfileUsername) return fromProfileUsername;

  const authEmail = pickString(input.authUser?.email);
  if (authEmail) {
    const manualId = authEmail.trim().toLowerCase();
    if (manualId?.endsWith(MANUAL_MEMBER_EMAIL_SUFFIX)) {
      const stripped = manualId.slice(0, -MANUAL_MEMBER_EMAIL_SUFFIX.length);
      if (stripped) return stripped;
    }
    if (!isAdminSyntheticAuthEmail(authEmail)) return authEmail;
  }

  return "이메일 없음";
}

function emailLoginIdentifier(input: {
  authUser?: AdminAuthListUser | null;
  profile?: AdminDisplayProfile | null;
  providerUserId?: string | null;
}): string {
  const displayEmail = resolveAdminDisplayEmail({
    authUser: input.authUser,
    profile: input.profile,
    provider: "email",
  });
  if (displayEmail) return displayEmail;

  const providerId = pickString(input.providerUserId) ?? pickString(input.profile?.provider_user_id);
  if (providerId) return providerId;

  return pickString(input.profile?.username) ?? "이메일 없음";
}

function snsLoginIdentifier(input: {
  provider: AdminAuthProvider;
  authUser?: AdminAuthListUser | null;
  profile?: AdminDisplayProfile | null;
  linkedIdentities?: readonly AdminLinkedIdentity[] | null;
  providerUserId?: string | null;
}): string {
  const displayEmail = resolveAdminDisplayEmail({
    authUser: input.authUser,
    profile: input.profile,
    linkedIdentities: input.linkedIdentities,
    provider: input.provider,
  });
  if (displayEmail) return displayEmail;

  const providerUserId =
    pickString(input.providerUserId) ??
    resolveAdminProviderUserId({
      provider: input.provider,
      authUser: input.authUser,
      profile: input.profile,
      linkedIdentities: input.linkedIdentities,
    });
  if (providerUserId) return providerUserId;

  return "이메일 없음";
}

/** 어드민 「로그인 아이디」 열 */
export function resolveAdminLoginIdentifier(input: {
  provider: AdminAuthProvider;
  authUser?: AdminAuthListUser | null;
  profile?: AdminDisplayProfile | null;
  testUser?: AdminDisplayTestUser | null;
  linkedIdentities?: readonly AdminLinkedIdentity[] | null;
  providerUserId?: string | null;
}): string {
  if (input.provider === "manual") {
    return manualLoginIdentifier(input);
  }
  if (input.provider === "email") {
    return emailLoginIdentifier({
      authUser: input.authUser,
      profile: input.profile,
      providerUserId: input.providerUserId,
    });
  }
  if (SNS_PROVIDERS.includes(input.provider as (typeof SNS_PROVIDERS)[number])) {
    return snsLoginIdentifier({
      provider: input.provider,
      authUser: input.authUser,
      profile: input.profile,
      linkedIdentities: input.linkedIdentities,
      providerUserId: input.providerUserId,
    });
  }

  return (
    resolveAdminDisplayEmail({
      authUser: input.authUser,
      profile: input.profile,
      linkedIdentities: input.linkedIdentities,
      provider: input.provider,
    }) ??
    pickString(input.profile?.username) ??
    pickString(input.providerUserId) ??
    "이메일 없음"
  );
}
