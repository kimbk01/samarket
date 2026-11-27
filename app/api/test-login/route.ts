import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 레거시 테스트 로그인 비활성화 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "test_login_removed", code: "test_login_removed" },
    { status: 410 }
  );
}
