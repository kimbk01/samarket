import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "legacy_meeting_chat_removed" },
    { status: 404 }
  );
}
