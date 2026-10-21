import type { OAuthProvider } from "@/lib/auth/auth-providers";
import type { ProviderEmailConflictState } from "@/lib/auth/provider-identity/provider-email-conflict.client";
import type { StoredAuthProvider } from "@/lib/auth/provider-identity/types";

const ATTEMPTED_PROVIDERS = new Set(["google", "kakao", "apple"]);
const STORED_PROVIDERS = new Set<StoredAuthProvider>(["google", "kakao", "apple", "naver", "facebook", "email"]);
const STASH_TOKEN_MAX_LEN = 4096;

/**
 * /login?auth_stash=… 콜백 리다이렉트 파서 (P1-4 hardening).
 * - stash 단독·불완전 맥락(email·attempted·existing 중 누락/미허용 값)은 거부한다.
 * - `hadStashParam` 이면 호출부는 URL 에서 즉시 제거한다.
 */
export function parseProviderEmailConflictRedirectParams(params: URLSearchParams): {
  hadStashParam: boolean;
  conflict: (ProviderEmailConflictState & { attemptedProvider: "google" | "kakao" | "apple" }) | null;
} {
  const stash = params.get("auth_stash")?.trim() ?? "";
  const hadStashParam = params.has("auth_stash");
  if (!stash || stash.length > STASH_TOKEN_MAX_LEN) return { hadStashParam, conflict: null };
  const email = params.get("auth_conflict_email")?.trim() ?? "";
  const attempted = params.get("auth_conflict_attempted")?.trim().toLowerCase() ?? "";
  const existingProviders = (params.get("auth_conflict_existing") ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is StoredAuthProvider => STORED_PROVIDERS.has(p as StoredAuthProvider));
  if (!email || !email.includes("@") || !ATTEMPTED_PROVIDERS.has(attempted) || existingProviders.length === 0) {
    return { hadStashParam, conflict: null };
  }
  return {
    hadStashParam,
    conflict: {
      email,
      attemptedProvider: attempted as "google" | "kakao" | "apple",
      existingProviders,
      stashToken: stash,
    },
  };
}

export type ConflictExistingLoginAction =
  | { kind: "oauth"; provider: OAuthProvider }
  | { kind: "internal" }
  | { kind: "unsupported" };

/**
 * P1-15 (UX-05): "기존 방법으로 로그인" 분기.
 * - google/kakao/apple → 화면의 useOAuthLogin().startOAuthProvider (lock·completion·오류 공통)
 * - email → 내부(아이디) 로그인 폼
 * - naver/facebook/미지 → 시작하지 않고 일반 안내만
 */
export function resolveConflictExistingLoginAction(
  provider: StoredAuthProvider | string | null | undefined,
): ConflictExistingLoginAction {
  const p = String(provider ?? "").trim().toLowerCase();
  if (p === "google" || p === "kakao" || p === "apple") return { kind: "oauth", provider: p };
  if (p === "email" || p === "password") return { kind: "internal" };
  return { kind: "unsupported" };
}
