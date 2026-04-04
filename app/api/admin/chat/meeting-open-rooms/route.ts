import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "커뮤니티 채팅 관리자 API는 제거되었습니다." },
    { status: 410 }
  );
}
