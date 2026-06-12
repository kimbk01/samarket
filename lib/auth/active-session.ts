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
