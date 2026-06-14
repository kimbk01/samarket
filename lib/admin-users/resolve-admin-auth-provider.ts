/**
 * 어드민 회원 목록 전용 — 가입수단 표시·집계 (read-only).
 * Supabase Auth SDK·로그인·profiles 쓰기와 분리한다.
 *
 * 동일 SNS(예: 카카오) 유저가 다르게 보이던 원인:
 * - 가입 시기별 `profiles.auth_provider` / `provider_user_id` 누락
 * - `ensurePendingAuthProfileRow` 가 synthetic auth email 을 profiles.email 에 기록(레거시)
 * - Supabase `identities[].provider === email` 이 SNS 메타보다 우선되던 구 로직
 *
 * 정립 규칙: synthetic 패턴·profile provider·linked identity·metadata 순으로 단일 분류.
 */

import {
  inferAuthProviderFromSyntheticEmail,
  isDibaySyntheticAuthEmail,
} from "@/lib/auth/synthetic-auth-email";
import type { AdminAuthProvider } from "@/lib/types/admin-user";

export type AdminAuthListUser = {
  id?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{
    id?: string | null;
    provider?: string | null;
    identity_data?: Record<string, unknown> | null;
    user_id?: string | null;
  }> | null;
};

export type AdminAuthProviderProfile = {
  provider?: string | null;
  auth_provider?: string | null;
  email?: string | null;
  auth_login_email?: string | null;
  provider_user_id?: string | null;
};

const SNS_PROVIDERS: readonly AdminAuthProvider[] = [
  "google",
  "kakao",
  "apple",
  "naver",
  "facebook",
];

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeAdminAuthProvider(input: unknown): AdminAuthProvider | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "custom:naver") return "naver";
  if (raw === "manual" || raw === "manual_admin" || raw === "manual_admin_backfill" || raw === "admin_manual") {
    return "manual";
  }
  if (
    raw === "google" ||
    raw === "kakao" ||
    raw === "naver" ||
    raw === "apple" ||
    raw === "facebook" ||
    raw === "email"
  ) {
    return raw;
  }
  return null;
}

/** Native bridge synthetic auth email → SNS provider (표시 전용). */
export function inferAdminAuthProviderFromSyntheticEmail(
  email: string | null | undefined,
): AdminAuthProvider | null {
  return inferAuthProviderFromSyntheticEmail(email);
}

function inferSyntheticProviderFromProfile(profile: AdminAuthProviderProfile | null | undefined): AdminAuthProvider | null {
  return (
    inferAdminAuthProviderFromSyntheticEmail(profile?.auth_login_email) ??
    inferAdminAuthProviderFromSyntheticEmail(profile?.email)
  );
}

function primaryLinkedProvider(linkedProviders: readonly string[] | null | undefined): AdminAuthProvider | null {
  if (!linkedProviders?.length) return null;
  for (const preferred of SNS_PROVIDERS) {
    if (linkedProviders.some((row) => normalizeAdminAuthProvider(row) === preferred)) {
      return preferred;
    }
  }
  for (const row of linkedProviders) {
    const normalized = normalizeAdminAuthProvider(row);
    if (normalized && normalized !== "email") return normalized;
  }
  return normalizeAdminAuthProvider(linkedProviders[0]);
}

function resolveProviderFromAuthIdentities(
  identities: AdminAuthListUser["identities"],
): AdminAuthProvider | null {
  const list = Array.isArray(identities) ? identities : [];
  for (const preferred of SNS_PROVIDERS) {
    if (list.some((identity) => normalizeAdminAuthProvider(identity.provider) === preferred)) {
      return preferred;
    }
  }
  for (const identity of list) {
    const normalized = normalizeAdminAuthProvider(identity.provider);
    if (normalized && normalized !== "email") return normalized;
  }
  return null;
}

function isRealEmailSignup(input: {
  authUser?: AdminAuthListUser | null;
  profile?: AdminAuthProviderProfile | null;
}): boolean {
  const authEmail = pickString(input.authUser?.email);
  if (authEmail && !isDibaySyntheticAuthEmail(authEmail)) return true;
  const profileEmail = pickString(input.profile?.auth_login_email) ?? pickString(input.profile?.email);
  if (profileEmail && !isDibaySyntheticAuthEmail(profileEmail)) {
    const provider =
      normalizeAdminAuthProvider(input.profile?.auth_provider) ??
      normalizeAdminAuthProvider(input.profile?.provider);
    return provider === "email" || provider === null;
  }
  return false;
}

export function resolveAdminAuthProvider(input: {
  authUser?: AdminAuthListUser | null;
  profile?: AdminAuthProviderProfile | null;
  isManualTestUser?: boolean;
  linkedProviders?: readonly string[] | null;
}): AdminAuthProvider {
  if (input.isManualTestUser) return "manual";

  const fromProfile =
    normalizeAdminAuthProvider(input.profile?.auth_provider) ??
    normalizeAdminAuthProvider(input.profile?.provider);
  if (fromProfile && fromProfile !== "email") return fromProfile;

  const fromProfileSynthetic = inferSyntheticProviderFromProfile(input.profile);
  if (fromProfileSynthetic) return fromProfileSynthetic;

  const fromLinked = primaryLinkedProvider(input.linkedProviders);
  if (fromLinked && fromLinked !== "email") return fromLinked;

  const fromSynthetic = inferAdminAuthProviderFromSyntheticEmail(input.authUser?.email);
  if (fromSynthetic) return fromSynthetic;

  const fromUserMeta =
    normalizeAdminAuthProvider(input.authUser?.user_metadata?.provider) ??
    normalizeAdminAuthProvider(input.authUser?.user_metadata?.auth_provider);
  if (fromUserMeta && fromUserMeta !== "email") return fromUserMeta;

  const fromAppMeta = normalizeAdminAuthProvider(input.authUser?.app_metadata?.provider);
  if (fromAppMeta && fromAppMeta !== "email") return fromAppMeta;

  const fromIdentities = resolveProviderFromAuthIdentities(input.authUser?.identities);
  if (fromIdentities) return fromIdentities;

  if (fromProfile === "email") return "email";
  if (fromLinked === "email") return "email";
  if (fromUserMeta === "email") return "email";
  if (fromAppMeta === "email") return "email";

  if (isRealEmailSignup(input)) return "email";

  return "unknown";
}

export function adminAuthProviderLabel(provider: AdminAuthProvider): string {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "Kakao";
  if (provider === "naver") return "Naver";
  if (provider === "apple") return "Apple";
  if (provider === "facebook") return "Facebook";
  if (provider === "manual") return "Manual";
  if (provider === "email") return "Email";
  return "Unknown";
}
