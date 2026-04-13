import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, getClientIp } from "@/lib/http/api-route";
import {
  KASAMA_DEV_UID_COOKIE,
  KASAMA_DEV_UID_PUB_COOKIE,
} from "@/lib/auth/dev-session-cookie";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { isTestUsersSurfaceEnabled } from "@/lib/config/test-users-surface";

/** 테스트용 아이디/비밀번호 검증 (test_users 테이블) */
export async function POST(req: NextRequest) {
  const loginRl = await enforceRateLimit({
    key: `test-login:${getClientIp(req)}`,
    limit: 25,
    windowMs: 900_000,
    message: "시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    code: "test_login_rate_limited",
  });
  if (!loginRl.ok) return loginRl.response;

  if (isProductionDeploy() || !isTestUsersSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: "아이디 로그인은 이 환경에서 비활성화되었습니다." },
      { status: 403 }
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "Supabase 설정 없음" }, { status: 500 });
  }
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "아이디와 비밀번호를 입력하세요" }, { status: 400 });
  }
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("test_users")
    .select("id, username, role")
    .eq("username", username)
    .eq("password", password)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "아이디 또는 비밀번호가 맞지 않습니다" }, { status: 401 });
  }
  const res = NextResponse.json({
    ok: true,
    userId: data.id,
    username: data.username,
    role: data.role,
  });
  const isProd = process.env.NODE_ENV === "production";
  const uid = data.id as string;
  res.cookies.set(KASAMA_DEV_UID_COOKIE, uid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: isProd,
  });
  if (!isProd) {
    res.cookies.set(KASAMA_DEV_UID_PUB_COOKIE, uid, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return res;
}
