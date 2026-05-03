import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { appendCommunityMessengerCallStubMessage } from "@/lib/community-messenger/service";
import type { CommunityMessengerCallKind, CommunityMessengerCallStatus } from "@/lib/community-messenger/types";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:call-stub-msg:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_stub_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const roomId = trimText(body.roomId);
  const senderId = trimText(body.senderId);
  const sessionId = trimText(body.sessionId);
  const tmpSessionId = trimText(body.tmpSessionId);
  const callKind = body.callKind === "video" || body.callKind === "voice" ? body.callKind : null;
  const status = body.status as CommunityMessengerCallStatus;
  const replaceExisting = body.replaceExisting === true;
  const durationSeconds = Math.max(0, Number(body.durationSeconds ?? 0));

  if (!roomId || !senderId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!callKind) {
    return NextResponse.json({ ok: false, error: "bad_call_kind" }, { status: 400 });
  }
  const okStatus =
    status === "dialing" ||
    status === "incoming" ||
    status === "missed" ||
    status === "cancelled" ||
    status === "rejected" ||
    status === "ended";
  if (!okStatus) {
    return NextResponse.json({ ok: false, error: "bad_status" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data: selfPart } = await sb
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!selfPart) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: memberRows } = await sb
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", roomId);
  const memberIds = new Set(
    ((memberRows ?? []) as Array<{ user_id?: string | null }>)
      .map((r) => trimText(r.user_id))
      .filter(Boolean)
  );
  if (!memberIds.has(senderId)) {
    return NextResponse.json({ ok: false, error: "bad_sender" }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  await appendCommunityMessengerCallStubMessage({
    userId: senderId,
    roomId,
    sessionId: sessionId || null,
    tmpSessionId: tmpSessionId || null,
    callKind,
    status,
    createdAt,
    replaceExisting,
    incrementUnread: !replaceExisting,
    durationSeconds,
  });

  return NextResponse.json({ ok: true });
}
