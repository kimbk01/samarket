import { NextResponse } from "next/server";
import {

  KASAMA_DEV_UID_COOKIE,
  KASAMA_DEV_UID_PUB_COOKIE,
} from "@/lib/auth/dev-session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 아이디 로그인(test_users) 세션 — HttpOnly 쿠키 제거 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set(KASAMA_DEV_UID_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
  res.cookies.set(KASAMA_DEV_UID_PUB_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: false,
    sameSite: "lax",
    secure: isProd,
  });
  return res;
}
