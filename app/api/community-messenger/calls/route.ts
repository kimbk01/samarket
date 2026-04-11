import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  createCommunityMessengerCallLog,
  listCommunityMessengerCallLogs,
} from "@/lib/community-messenger/service";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const calls = await listCommunityMessengerCallLogs(auth.userId);
  return NextResponse.json({ ok: true, calls });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: {
    roomId?: string | null;
    peerUserId?: string | null;
    callKind?: "voice" | "video";
    status?: "dialing" | "incoming" | "missed" | "cancelled" | "rejected" | "ended";
    durationSeconds?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.callKind !== "voice" && body.callKind !== "video") {
    return NextResponse.json({ ok: false, error: "bad_call_kind" }, { status: 400 });
  }
  if (
    body.status !== "dialing" &&
    body.status !== "incoming" &&
    body.status !== "missed" &&
    body.status !== "cancelled" &&
    body.status !== "rejected" &&
    body.status !== "ended"
  ) {
    return NextResponse.json({ ok: false, error: "bad_status" }, { status: 400 });
  }

  const result = await createCommunityMessengerCallLog({
    userId: auth.userId,
    roomId: body.roomId,
    peerUserId: body.peerUserId,
    callKind: body.callKind,
    status: body.status,
    durationSeconds: Number(body.durationSeconds ?? 0),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
