import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "일반 채팅은 제거되었습니다." },
    { status: 410 }
  );
}
