/**
 * POST /api/admin/chat/rooms/:id/messages/bulk-unhide
 * Body: { reason: string } — 관리자로 숨긴 비시스템 메시지 일괄 복구
 * R1-A: 권한 `chats` + 사유 2자 이상 + 상태 조건(is_hidden_by_admin=true) + audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { chatAdminReasonRequired, requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  CHAT_ADMIN_AUDIT_MESSAGE_HIDE,
  CHAT_ADMIN_AUDIT_MESSAGE_UNHIDE,
  isChatAdminReasonValid,
  normalizeChatAdminReason,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { bulkSetTradeMessengerMessagesHidden } from "@/lib/admin-chats/trade-messenger-bulk-hide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;

  const { id: roomId } = await params;
  const rid = roomId?.trim();
  if (!rid) return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });

  let body: { reason?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const reasonMeta = normalizeChatAdminReason(body.reason);
  if (!isChatAdminReasonValid(reasonMeta, CHAT_ADMIN_ACTION_REASON_MIN_LENGTH)) {
    return chatAdminReasonRequired(CHAT_ADMIN_ACTION_REASON_MIN_LENGTH);
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const sbAny = sb as any;
  // R1-B C-1: 사용자 방(CM) 메시지에 먼저 적용. 레거시 chat_messages 는 연결 room 이 있을 때만 동기.
  let messengerBulk: { messengerRoomId: string; count: number } | null = null;
  try {
    messengerBulk = await bulkSetTradeMessengerMessagesHidden(sbAny, req, {
      legacyId: rid,
      adminUserId: admin.actor.userId,
      hidden: false,
      reason: reasonMeta,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const { data: room } = await sbAny.from("chat_rooms").select("id").eq("id", rid).maybeSingle();
  if (!room && messengerBulk) {
    return NextResponse.json({ ok: true, unhidden_count: messengerBulk.count, messengerRoomId: messengerBulk.messengerRoomId });
  }
  if (!room) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: updated, error } = await sbAny
    .from("chat_messages")
    .update({ is_hidden_by_admin: false, hidden_reason: null })
    .eq("room_id", rid)
    .eq("is_hidden_by_admin", true)
    .neq("message_type", "system")
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const n = updated?.length ?? 0;
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: rid,
      event_type: "message_hidden",
      actor_admin_id: admin.actor.userId,
      metadata: { bulk_unhide: true, count: n, reason: reasonMeta },
    });
  } catch {
    /* ignore */
  }

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "chat_room",
    targetId: rid,
    action: `${CHAT_ADMIN_AUDIT_MESSAGE_UNHIDE}.bulk`,
    before: { is_hidden_by_admin: true, count: n },
    after: {
      is_hidden_by_admin: false,
      count: n,
      messageIds: (updated ?? []).slice(0, 200).map((m: { id: string }) => m.id),
      reason: reasonMeta,
    },
  });

  return NextResponse.json({
    ok: true,
    unhidden_count: messengerBulk ? messengerBulk.count : n,
    messengerRoomId: messengerBulk?.messengerRoomId ?? null,
  });
}
