import { NextRequest, NextResponse } from "next/server";
import {
  appendChatContentViewAudit,
  readChatAdminReason,
  requireChatAdmin,
} from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  CHAT_ADMIN_GHOST_REASON_MIN_LENGTH,
  CM_REPORT_OPEN_STATUSES,
  decideChatContentAccess,
  resolveCmRoomContentDomain,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { getAdminCommunityMessengerRoomDetail } from "@/lib/admin-community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 메신저 방 상세 (R1-A).
 * - 권한 `chats`. 메타(방·참여자·통화·신고)는 항상 반환.
 * - 메시지 본문: 신고(열림)·거래·주문 연결 방은 `chats` 로 열람, 연결 없는 사적 방은 고스트 —
 *   super_admin + 사유(`?reason=` 10자 이상). 미충족 시 messages=[] 와 contentAccess.denial 반환.
 * - 본문을 반환할 때만 서버에서 audit_logs `chat_room.content_view` 기록 (참가자 생성·읽음·발송 없음).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const roomId = String(id ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "room_id_required" }, { status: 400 });
  }

  const { data: roomMeta } = await admin.sb
    .from("community_messenger_rooms")
    .select("id, room_type, chat_domain, direct_key")
    .eq("id", roomId)
    .maybeSingle();
  if (!roomMeta) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const [{ count: openReportCount }, { data: linkedOrder }] = await Promise.all([
    admin.sb
      .from("community_messenger_reports")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .in("status", [...CM_REPORT_OPEN_STATUSES]),
    admin.sb
      .from("store_orders")
      .select("id")
      .eq("community_messenger_room_id", roomId)
      .limit(1)
      .maybeSingle(),
  ]);

  const domain = resolveCmRoomContentDomain(roomMeta as { chat_domain?: string; room_type?: string; direct_key?: string });
  const reason = readChatAdminReason(req);
  const decision = decideChatContentAccess({
    domain,
    hasOpenReport: Number(openReportCount ?? 0) > 0,
    linkedStoreOrder: Boolean((linkedOrder as { id?: string } | null)?.id),
    isSuperAdmin: admin.actor.isSuperAdmin,
    reason,
  });

  const detail = await getAdminCommunityMessengerRoomDetail(roomId);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const contentAccess = decision.granted
    ? { granted: true as const, basis: decision.basis, ghost: decision.ghost, domain }
    : {
        granted: false as const,
        denial: decision.denial,
        ghost: true as const,
        domain,
        reasonMinLength: CHAT_ADMIN_GHOST_REASON_MIN_LENGTH,
      };

  if (!decision.granted) {
    return NextResponse.json({
      ok: true,
      ...detail,
      room: { ...detail.room, lastMessage: "-" },
      messages: [],
      contentAccess,
    });
  }

  await appendChatContentViewAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "community_messenger_room",
    roomId,
    domain,
    basis: decision.basis,
    reason,
    scope: { surface: "admin_messenger_detail", messageCount: detail.messages.length },
  });

  return NextResponse.json({ ok: true, ...detail, contentAccess });
}
