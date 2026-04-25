import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 레거시 테스트 로그인 비활성화 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "임시 테스트 로그인은 제거되었습니다. Google, Kakao, Naver 또는 이메일 로그인을 사용해 주세요." },
    { status: 410 }
  );
}
