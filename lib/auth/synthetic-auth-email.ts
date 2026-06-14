/**
 * Native/Manual bridge — Supabase Auth 내부 이메일 식별 (저장·표시 공통).
 * 사용자 연락 이메일과 분리한다.
 */

import { MANUAL_MEMBER_EMAIL_SUFFIX } from "@/lib/auth/manual-member-email";
import { APPLE_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/apple-auth-env.server";
import { GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/google-auth-env.server";
import { KAKAO_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/kakao-auth-env.server";

export type SyntheticAuthProvider = "google" | "kakao" | "apple";

const NATIVE_SYNTHETIC_SUFFIXES = [
  `@${GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN}`,
  `@${KAKAO_NATIVE_AUTH_EMAIL_DOMAIN}`,
  `@${APPLE_NATIVE_AUTH_EMAIL_DOMAIN}`,
] as const;

export function isDibaySyntheticAuthEmail(email: string | null | undefined): boolean {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.endsWith(MANUAL_MEMBER_EMAIL_SUFFIX)) return true;
  if (NATIVE_SYNTHETIC_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  if (/^orphan\.[a-f0-9]+\.\d+@google\.native\.dibay\.internal$/i.test(normalized)) return true;
  return false;
}

export function inferAuthProviderFromSyntheticEmail(
  email: string | null | undefined,
): SyntheticAuthProvider | null {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.endsWith(`@${GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN}`)) return "google";
  if (normalized.endsWith(`@${KAKAO_NATIVE_AUTH_EMAIL_DOMAIN}`)) return "kakao";
  if (normalized.endsWith(`@${APPLE_NATIVE_AUTH_EMAIL_DOMAIN}`)) return "apple";
  return null;
}

export function inferProviderUserIdFromSyntheticAuthEmail(
  email: string | null | undefined,
): string | null {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  for (const prefix of ["google.", "kakao.", "apple."] as const) {
    for (const suffix of NATIVE_SYNTHETIC_SUFFIXES) {
      if (normalized.startsWith(prefix) && normalized.endsWith(suffix)) {
        const local = normalized.slice(prefix.length, normalized.length - suffix.length);
        return local || null;
      }
    }
  }
  return null;
}

/** profiles.email / auth_login_email 에 넣을 수 있는 실제 연락 이메일만 반환 */
export function pickContactEmailForProfile(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const trimmed = String(candidate ?? "").trim();
    if (!trimmed) continue;
    if (isDibaySyntheticAuthEmail(trimmed)) continue;
    return trimmed.toLowerCase();
  }
  return null;
}
