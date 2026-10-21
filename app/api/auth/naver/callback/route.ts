import { NextResponse } from "next/server";
import { NAVER_LOGIN_DISABLED_ERROR_CODE } from "@/lib/auth/naver-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P0-1 (Owner 결정 2026-10-21) — Naver 로그인 비활성 (callback).
 * auth.users 조회·생성·비밀번호 재설정·profiles 덮어쓰기 경로 없음. 항상 410.
 */
function naverLoginDisabled(): NextResponse {
  const res = NextResponse.json(
    {
      ok: false,
      errorCode: NAVER_LOGIN_DISABLED_ERROR_CODE,
      error: NAVER_LOGIN_DISABLED_ERROR_CODE,
      message: "Naver login is no longer supported.",
    },
    { status: 410 },
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function GET() {
  return naverLoginDisabled();
}

export function POST() {
  return naverLoginDisabled();
}
