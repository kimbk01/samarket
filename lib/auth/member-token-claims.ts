/**
 * D5 (auth-hard-lock.md Amendment 2026-11-19 (2) · Owner 「D5 승인」) — 토큰 클레임 `dibay_m` 읽기.
 *
 * `public.custom_access_token_hook` 이 토큰 발급·갱신 때 넣은 회원 상태·약관 동의 값.
 * proxy 게이트가 **긍정 판정(활성·약관 완료)일 때만** DB(`profiles`)를 건너뛰는 데 쓴다. 그 밖은 기존 DB 경로.
 *
 * 신뢰 조건 (하나라도 아니면 null → 기존 DB 경로):
 *  - 쿠키 access token 을 **만료 허용 없이** `getClaims(token)` 로 서명 검증 성공
 *  - 비대칭 서명(ES/RS/EdDSA) — 대칭(HS)이면 getClaims 가 Auth 서버를 부르므로 쓰지 않는다(호출 증가 방지)
 *  - `exp` 가 지금보다 뒤 · `sub` 가 게이트가 확정한 사용자와 같음 · `dibay_m.v === 1`
 */
import { createServerClient, stringFromBase64URL } from "@supabase/ssr";
import { readAccessTokenFromCookies, type CookiePair } from "@/lib/auth/read-access-token-from-cookies";
import {
  resolveMemberAccountLifecycle,
  type MemberAccountLifecycle,
} from "@/lib/auth/member-account-state";

export const DIBAY_MEMBER_CLAIM_KEY = "dibay_m";

export type DibayMemberClaim = {
  v: 1;
  status: string | null;
  deleted_at: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  privacy_accepted_at: string | null;
  privacy_version: string | null;
};

const ASYMMETRIC_ALG = /^(ES|RS|PS|Ed)/;

function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function parseDibayMemberClaim(raw: unknown): DibayMemberClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  return {
    v: 1,
    status: strOrNull(r.status),
    deleted_at: strOrNull(r.deleted_at),
    terms_accepted_at: strOrNull(r.terms_accepted_at),
    terms_version: strOrNull(r.terms_version),
    privacy_accepted_at: strOrNull(r.privacy_accepted_at),
    privacy_version: strOrNull(r.privacy_version),
  };
}

export function lifecycleFromDibayMemberClaim(claim: DibayMemberClaim): MemberAccountLifecycle {
  return resolveMemberAccountLifecycle({ status: claim.status, deleted_at: claim.deleted_at });
}

/** 클레임만으로 읽기를 통과시켜도 되는 상태 — 기존 읽기 게이트와 같은 기준(차단·탈퇴만 403) 중 확실한 허용만 */
export function isDibayMemberClaimReadAllowed(claim: DibayMemberClaim): boolean {
  const lc = lifecycleFromDibayMemberClaim(claim);
  return lc === "active" || lc === "suspended";
}

function tokenAlg(token: string): string {
  try {
    const head = JSON.parse(stringFromBase64URL(token.split(".")[0] ?? "")) as { alg?: unknown };
    return typeof head.alg === "string" ? head.alg : "";
  } catch {
    return "";
  }
}

export type VerifiedMemberClaimInput = {
  cookies: CookiePair[];
  supabaseUrl: string;
  anonKey: string;
  expectedUserId: string;
  nowMs?: number;
};

export async function readVerifiedDibayMemberClaim(input: VerifiedMemberClaimInput): Promise<DibayMemberClaim | null> {
  const expected = input.expectedUserId.trim();
  if (!expected) return null;
  try {
    const cookieToken = await readAccessTokenFromCookies(input.cookies, input.supabaseUrl);
    if (!cookieToken) return null;
    if (!ASYMMETRIC_ALG.test(tokenAlg(cookieToken.accessToken))) return null;
    const supabase = createServerClient(input.supabaseUrl, input.anonKey, {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* 읽기 전용 — 세션을 로드·갱신하지 않는다 */
        },
      },
    });
    const { data, error } = await supabase.auth.getClaims(cookieToken.accessToken);
    if (error || !data?.claims || typeof data.claims !== "object") return null;
    const claims = data.claims as Record<string, unknown>;
    if (String(claims.sub ?? "").trim() !== expected) return null;
    const exp = typeof claims.exp === "number" ? claims.exp : 0;
    if (exp * 1000 <= (input.nowMs ?? Date.now())) return null;
    return parseDibayMemberClaim(claims[DIBAY_MEMBER_CLAIM_KEY]);
  } catch {
    return null;
  }
}
