import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isMessengerGeneralFriendDirectKey } from "@/lib/community-messenger/messenger-room-domain";
import { executeGiftTransferOffer } from "@/lib/gift-certificate/execute-gift-transfer-offer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/transfers/offer */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const instanceId = String(body.instanceId ?? "").trim();
  const recipientUserId = String(body.recipientUserId ?? "").trim();
  const roomIdRaw = String(body.roomId ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!instanceId || !recipientUserId || !idempotencyKey) {
    return NextResponse.json(
      { ok: false, error: "instanceId_recipientUserId_idempotencyKey_required" },
      { status: 400 }
    );
  }
  if (!roomIdRaw) {
    return NextResponse.json({ ok: false, error: "roomId_required" }, { status: 400 });
  }

  const { data: room } = await sb
    .from("community_messenger_rooms")
    .select("room_type, chat_domain, direct_key")
    .eq("id", roomIdRaw)
    .maybeSingle();
  const roomType = String((room as { room_type?: unknown } | null)?.room_type ?? "").trim();
  const chatDomain = String((room as { chat_domain?: unknown } | null)?.chat_domain ?? "").trim();
  const directKey = String((room as { direct_key?: unknown } | null)?.direct_key ?? "").trim();
  const isGeneralDirect =
    roomType === "direct" &&
    (chatDomain === "general_direct" || (!chatDomain && isMessengerGeneralFriendDirectKey(directKey)));
  if (!isGeneralDirect) {
    return NextResponse.json({ ok: false, error: "not_general_direct" }, { status: 400 });
  }

  const { data: senderProfile } = await sb
    .from("profiles")
    .select("nickname, dibay_id")
    .eq("id", userId)
    .maybeSingle();
  const senderLabel = String(
    (senderProfile as { nickname?: string; dibay_id?: string } | null)?.nickname ??
      (senderProfile as { dibay_id?: string } | null)?.dibay_id ??
      ""
  ).trim();

  const result = await executeGiftTransferOffer(sb, {
    senderUserId: userId,
    instanceId,
    recipientUserId,
    roomId: roomIdRaw,
    idempotencyKey,
    senderLabel,
  });

  if (!result.ok) {
    const status = result.error === "message_projection_missing" ? 500 : 400;
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    transfer_id: result.transferId,
    id: result.transferId,
    message_id: result.messageId,
    room_id: result.roomId,
    recipient_user_id: result.recipientUserId,
    message: result.message,
    idempotent: result.idempotent ?? false,
  });
}
