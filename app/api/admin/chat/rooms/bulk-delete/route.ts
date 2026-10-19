/**
 * POST /api/admin/chat/rooms/bulk-delete
 * 관리자: 레거시 채팅방 영구 삭제 (통합 chat_rooms 또는 레거시 product_chats) — 법적 요청 처리 전용.
 *
 * R1-A (C-3):
 * - super_admin 전용 (`requireSuperAdmin`).
 * - Body: { items: {id, storage}[], reason (10자 이상), confirmText: "DELETE" } — L3 확인 문구 재입력.
 * - 신고·조치 증거(`reports`·`chat_reports`·`moderation_actions`)는 삭제하지 않는다.
 *   신고가 연결된 방(연결 레거시 방 포함)은 삭제 대상에서 제외(evidence_preserved) — 운영 FK 가 SET NULL 이라 지우면 증거 연결이 끊긴다.
 * - audit_logs `chat_room.hard_delete` 에 방 id·건수·제외 목록·증거 건수·사유 기록.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { CHAT_ADMIN_AUDIT_HARD_DELETE } from "@/lib/admin/chat-admin/chat-content-access-policy";
import { lookupChatRoomEvidence } from "@/lib/admin/chat-admin/chat-room-evidence-lookup";
import {
  parseChatHardDeleteRequest,
  planChatHardDelete,
} from "@/lib/admin/chat-admin/chat-room-hard-delete-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseChatHardDeleteRequest(json);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const allIds = parsed.items.map((x) => x.id);

  // 증거 조회 (연결 레거시 방 포함) — 조회 실패는 삭제 중단 (fail closed).
  const evidence = await lookupChatRoomEvidence(sb, allIds);
  if (!evidence.ok) {
    return NextResponse.json({ ok: false, error: evidence.error }, { status: 500 });
  }
  const evidenceRoomIds = evidence.evidenceRoomIds;
  const evidenceCounts = evidence.counts;

  const plan = planChatHardDelete(parsed.items, evidenceRoomIds);
  const deleted: string[] = [];
  const errors: { id: string; message: string }[] = plan.skipped.map((s) => ({
    id: s.id,
    message: "evidence_preserved",
  }));

  if (plan.deleteChatRoomIds.length > 0) {
    const { error: delErr } = await sb.from("chat_rooms").delete().in("id", plan.deleteChatRoomIds);
    if (delErr) {
      for (const id of plan.deleteChatRoomIds) errors.push({ id, message: delErr.message });
    } else {
      deleted.push(...plan.deleteChatRoomIds);
    }
  }

  if (plan.deleteProductChatIds.length > 0) {
    const { error: pcErr } = await sb.from("product_chats").delete().in("id", plan.deleteProductChatIds);
    if (pcErr) {
      for (const id of plan.deleteProductChatIds) {
        if (!errors.some((e) => e.id === id)) errors.push({ id, message: pcErr.message });
      }
    } else {
      for (const id of plan.deleteProductChatIds) {
        if (!deleted.includes(id)) deleted.push(id);
      }
    }
  }

  await appendAdminRouteAudit(sb, req, {
    actorId: admin.actor.userId,
    targetType: "chat_room_bulk",
    targetId: deleted[0] ?? allIds[0] ?? "",
    action: CHAT_ADMIN_AUDIT_HARD_DELETE,
    before: {
      requested: parsed.items,
      requestedCount: parsed.items.length,
      evidenceCounts,
      linkedIds: evidence.linkedIds,
    },
    after: {
      reason: parsed.reason,
      deletedIds: deleted,
      deletedCount: deleted.length,
      skipped: plan.skipped,
      errors,
      evidencePreserved: true,
    },
  });

  return NextResponse.json({
    ok: errors.length === 0,
    deleted,
    skipped: plan.skipped.length ? plan.skipped : undefined,
    errors: errors.length ? errors : undefined,
  });
}
