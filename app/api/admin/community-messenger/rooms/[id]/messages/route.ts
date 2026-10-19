import { NextRequest, NextResponse } from "next/server";
import {
  appendChatContentViewAudit,
  readChatAdminReason,
  requireChatRoomAdmin,
} from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  CHAT_ADMIN_GHOST_REASON_MIN_LENGTH,
  CM_REPORT_OPEN_STATUSES,
  decideChatContentAccess,
  resolveCmRoomContentDomain,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { listAdminCommunityMessengerRoomMessages } from "@/lib/admin-community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 메신저 방 메시지 페이지 (R1-B · C-6). 사용자와 같은 id 커서.
 * Query: `before` (앵커 메시지 id — 없으면 최신 페이지), `limit` (기본 80, 최대 100), `reason` (고스트 열람 사유).
 * 본문 열람 판정·감사는 상세 GET(R1-A)과 같은 정책을 쓴다. 읽기 전용 (참가자·읽음·unread 미변경).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roomId = String(id ?? "").trim();
  const admin = await requireChatRoomAdmin(roomId);
  if (!admin.ok) return admin.response;

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
  if (!decision.granted) {
    return NextResponse.json(
      {
        ok: false,
        error: decision.denial,
        reasonMinLength: CHAT_ADMIN_GHOST_REASON_MIN_LENGTH,
      },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const before = sp.get("before")?.trim() || null;
  const result = await listAdminCommunityMessengerRoomMessages({
    roomId,
    before,
    limit: sp.get("limit"),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error === "anchor_not_found" ? 404 : 500 }
    );
  }

  await appendChatContentViewAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "community_messenger_room",
    roomId,
    domain,
    basis: decision.basis,
    reason,
    scope: { surface: "admin_messenger_messages_page", before, messageCount: result.messages.length },
  });

  return NextResponse.json({ ok: true, messages: result.messages, hasMore: result.hasMore });
}
