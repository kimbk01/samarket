/**
 * POST /api/admin/chat/rooms/bulk-delete
 * 관리자: 레거시 채팅방 영구 삭제 (통합 chat_rooms 또는 레거시 product_chats) — 법적 요청 처리 전용.
 *
 * R1-A (C-3):
 * - super_admin 전용 (`requireSuperAdmin`).
 * - Body: { items: {id, storage}[], reason (10자 이상), confirmText: "DELETE" } — L3 확인 문구 재입력.
 * - 신고·조치 증거(`reports`·`chat_reports`·`moderation_actions`)는 삭제하지 않는다.
 *   신고가 연결된 방은 삭제 대상에서 제외(evidence_preserved) — FK CASCADE 로 증거가 사라지지 않게.
 * - audit_logs `chat_room.hard_delete` 에 방 id·건수·제외 목록·증거 건수·사유 기록.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { CHAT_ADMIN_AUDIT_HARD_DELETE } from "@/lib/admin/chat-admin/chat-content-access-policy";
import {
  parseChatHardDeleteRequest,
  planChatHardDelete,
} from "@/lib/admin/chat-admin/chat-room-hard-delete-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingTable(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache/i.test(message));
}

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

  // 증거 조회 — 테이블 부재는 0건, 그 외 조회 실패는 삭제 중단 (fail closed).
  const evidenceRoomIds = new Set<string>();
  const evidenceCounts = { chat_reports: 0, reports: 0, moderation_actions: 0 };

  const chatReports = await sb.from("chat_reports").select("id, room_id").in("room_id", allIds);
  if (chatReports.error && !isMissingTable(chatReports.error.message)) {
    return NextResponse.json({ ok: false, error: "evidence_lookup_failed" }, { status: 500 });
  }
  for (const row of (chatReports.data ?? []) as Array<{ room_id?: string | null }>) {
    if (row.room_id) evidenceRoomIds.add(row.room_id);
    evidenceCounts.chat_reports += 1;
  }

  const reportsByRoom = await sb.from("reports").select("id, room_id").in("room_id", allIds);
  if (reportsByRoom.error && !isMissingTable(reportsByRoom.error.message)) {
    return NextResponse.json({ ok: false, error: "evidence_lookup_failed" }, { status: 500 });
  }
  const reportsByTarget = await sb
    .from("reports")
    .select("id, target_id")
    .eq("target_type", "chat_room")
    .in("target_id", allIds);
  if (reportsByTarget.error && !isMissingTable(reportsByTarget.error.message)) {
    return NextResponse.json({ ok: false, error: "evidence_lookup_failed" }, { status: 500 });
  }
  const reportIds = new Set<string>();
  for (const row of (reportsByRoom.data ?? []) as Array<{ id: string; room_id?: string | null }>) {
    if (row.room_id) evidenceRoomIds.add(row.room_id);
    reportIds.add(row.id);
  }
  for (const row of (reportsByTarget.data ?? []) as Array<{ id: string; target_id?: string | null }>) {
    if (row.target_id) evidenceRoomIds.add(row.target_id);
    reportIds.add(row.id);
  }
  evidenceCounts.reports = reportIds.size;

  const modActions = await sb
    .from("moderation_actions")
    .select("id", { count: "exact", head: true })
    .eq("target_type", "room")
    .in("target_id", allIds);
  evidenceCounts.moderation_actions = Number(modActions.count ?? 0);

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
