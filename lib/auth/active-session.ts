import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACTIVE_SESSION_COOKIE,
} from "@/lib/auth/active-session-shared";
import { cookieSecureFromNextHeaders } from "@/lib/auth/cookie-secure-flag";

async function resolveCookieSecure(secure?: boolean): Promise<boolean> {
  if (typeof secure === "boolean") return secure;
  return cookieSecureFromNextHeaders();
}

export function createActiveSessionId(): string {
  return randomUUID();
}

export async function readActiveSessionIdCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(ACTIVE_SESSION_COOKIE)?.value?.trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * 활성 세션 쿠키가 없는 요청의 세션 번호 — 사용자별 고정 키.
 * 예전에는 모든 사용자가 같은 `"∅"` 를 써서 전역 UNIQUE `user_sessions.session_id` 한 줄을 서로 덮어썼다
 * (2026-10-31 운영: 같은 행이 iPhone `w테스트1` → Android `q테스트1` 로 바뀜). 판정(쿠키 없어도 통과·전체 로그아웃 차단)은 그대로.
 */
export function cookielessActiveSessionFingerprint(userId: string): string {
  return `cookieless:${userId.trim()}`;
}

/** 세션 검증용 번호 — 쿠키 값, 없으면 사용자별 `cookielessActiveSessionFingerprint`. */
export async function readActiveSessionFingerprintForUser(userId: string): Promise<string> {
  return (await readActiveSessionIdCookie())?.trim() || cookielessActiveSessionFingerprint(userId);
}

export async function setActiveSessionCookie(
  response: NextResponse,
  sessionId: string,
  secure?: boolean
): Promise<NextResponse> {
  response.cookies.set(ACTIVE_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: await resolveCookieSecure(secure),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function clearActiveSessionCookie(
  response: NextResponse,
  secure?: boolean
): Promise<NextResponse> {
  response.cookies.set(ACTIVE_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: await resolveCookieSecure(secure),
    path: "/",
    maxAge: 0,
  });
  return response;
}
