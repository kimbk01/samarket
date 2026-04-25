import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http/api-route";
import {
  ACTIVE_SESSION_COOKIE,
  SESSION_REPLACED_CODE,
  SESSION_REPLACED_MESSAGE,
} from "@/lib/auth/active-session-shared";

function isSecureCookie(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
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

export function setActiveSessionCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(ACTIVE_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export function clearActiveSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(ACTIVE_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function sessionReplacedResponse() {
  return jsonError(SESSION_REPLACED_MESSAGE, { status: 401, code: SESSION_REPLACED_CODE });
}
