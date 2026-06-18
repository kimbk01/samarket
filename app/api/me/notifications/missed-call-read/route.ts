import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { markMissedCallsRead } from "@/lib/notifications/pipeline/notify-read-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: { roomId?: string; callSessionId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const roomId = String(body.roomId ?? "").trim();
  const callSessionId = String(body.callSessionId ?? "").trim();
  if (!roomId && !callSessionId) {
    return NextResponse.json({ ok: false, error: "room_or_call_required" }, { status: 400 });
  }

  const cleared = await markMissedCallsRead(sb, userId, {
    roomId: roomId || undefined,
    callSessionId: callSessionId || undefined,
  });
  return NextResponse.json({ ok: true, cleared });
}
