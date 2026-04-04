import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  createCommunityMessengerCallSignal,
  listCommunityMessengerCallSignals,
} from "@/lib/community-messenger/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { sessionId } = await params;
  const signals = await listCommunityMessengerCallSignals(auth.userId, sessionId);
  return NextResponse.json({ ok: true, signals });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: {
    toUserId?: string;
    signalType?: "offer" | "answer" | "ice-candidate" | "hangup";
    payload?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (
    body.signalType !== "offer" &&
    body.signalType !== "answer" &&
    body.signalType !== "ice-candidate" &&
    body.signalType !== "hangup"
  ) {
    return NextResponse.json({ ok: false, error: "bad_signal_type" }, { status: 400 });
  }

  const { sessionId } = await params;
  const result = await createCommunityMessengerCallSignal({
    userId: auth.userId,
    sessionId,
    toUserId: String(body.toUserId ?? ""),
    signalType: body.signalType,
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
