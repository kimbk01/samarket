/**
 * P2-6 (SV-04) — 차단·탈퇴 회원의 GET /api/* 읽기를 access token 만료 전에도 거부.
 *
 * - 대상: 세션 쿠키가 있는 GET/HEAD /api/* (관리자·cron·webhook 등 NON_MEMBER, 아래 읽기 예외 제외).
 * - 판정: lifecycle authority **캐시 경로**(member-lifecycle-authority-cache TTL 5s, 모더레이션 시 무효화).
 *   요청마다 비캐시 DB 읽기를 추가하지 않는다 — miss 시 profiles PK 1회 조회(사용자별 단일 비행).
 * - blocked / withdrawn → 403 `account_restricted`. suspended 는 읽기 허용(설계).
 * - 조회 실패·identity 일시 오류 → 통과(읽기 fail-open, 장애 방지) + 로그.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requestHasSupabaseSessionCookie } from "@/lib/auth/api-auth-cookie-presence";
import { resolveApiIdentity } from "@/lib/auth/enforce-api-member-mutation-policy";
import { isNonMemberMutationPath, normalizeApiPath } from "@/lib/auth/member-action-policy";
import { resolveMemberLifecycleAuthority } from "@/lib/auth/resolve-member-lifecycle-authority";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const READ_METHODS = new Set(["GET", "HEAD"]);

export const API_ACCOUNT_RESTRICTED = {
  status: 403,
  code: "account_restricted",
  messageKo: "이용이 제한된 계정입니다.",
} as const;

/**
 * 제한 회원도 읽을 수 있어야 하는 GET — 로그아웃·세션 정리·이의제기·프로필 부트스트랩
 * (`/api/me/profile` 은 차단·탈퇴 회원에게 profile:null 을 돌려 클라이언트 로그아웃을 유도한다).
 */
export function isMemberReadExemptPath(pathname: string): boolean {
  const p = normalizeApiPath(pathname);
  if (!p.startsWith("/api/")) return true;
  if (isNonMemberMutationPath(p)) return true;
  if (p === "/api/auth" || p.startsWith("/api/auth/")) return true;
  if (p === "/api/support" || p.startsWith("/api/support/")) return true;
  if (p === "/api/me/profile" || p === "/api/me/signup-status") return true;
  return false;
}

/**
 * @returns null to continue to route handler; NextResponse(403) when blocked/withdrawn.
 */
export async function enforceApiMemberReadPolicy(
  request: NextRequest
): Promise<NextResponse | null> {
  if (!READ_METHODS.has(request.method.toUpperCase())) return null;
  if (isMemberReadExemptPath(request.nextUrl.pathname)) return null;
  // 익명 요청은 추가 비용 0 — 쿠키 이름 스캔만.
  if (!requestHasSupabaseSessionCookie(request)) return null;

  try {
    const identity = await resolveApiIdentity(request);
    const userId = identity.userId;
    if (!userId) return null;

    const authority = await runSingleFlight(`api-read-lifecycle:${userId}`, () =>
      resolveMemberLifecycleAuthority(userId)
    );
    if (authority.kind !== "RESOLVED") {
      if (authority.kind === "AUTHORITY_UNAVAILABLE") {
        console.warn("[api-read-policy] lifecycle unavailable — fail-open", authority.reason);
      }
      return null;
    }
    if (authority.lifecycle !== "blocked" && authority.lifecycle !== "withdrawn") return null;
    return NextResponse.json(
      {
        ok: false,
        error: API_ACCOUNT_RESTRICTED.code,
        code: API_ACCOUNT_RESTRICTED.code,
        message: API_ACCOUNT_RESTRICTED.messageKo,
        authenticated: true,
        lifecycle: authority.lifecycle,
      },
      { status: API_ACCOUNT_RESTRICTED.status }
    );
  } catch (err) {
    console.warn(
      "[api-read-policy] identity/lifecycle lookup failed — fail-open",
      err instanceof Error ? err.message : "unknown"
    );
    return null;
  }
}
