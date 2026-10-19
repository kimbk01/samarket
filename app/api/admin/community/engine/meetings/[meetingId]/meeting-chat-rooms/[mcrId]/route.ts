/**
 * DELETE — 모임 부가 채팅(meeting_chat_rooms) 및 연결된 chat_rooms 정리 (기본 전체 채팅은 불가)
 *
 * 채팅 Admin C-3 (증거 보존): super_admin 전용 · Body `{ reason (커뮤니티 공통 사유 규칙 2자↑ — C-30), confirmText: "DELETE" }` ·
 * 신고가 연결된 방은 409 `evidence_preserved` · 신고(`chat_reports`)·조치(`moderation_actions`)는 지우지 않음 ·
 * audit_logs `chat_room.hard_delete`.
 */
import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  CHAT_ADMIN_AUDIT_HARD_DELETE,
  CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import {
  COMMUNITY_ADMIN_REASON_MIN_LENGTH,
  normalizeCommunityAdminReason,
} from "@/lib/admin/community-admin/community-admin-reason";
import { lookupChatRoomEvidence } from "@/lib/admin/chat-admin/chat-room-evidence-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function deleteLinkedChatRoom(
  sb: ReturnType<typeof getSupabaseServer>,
  linkedChatRoomId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const roomId = linkedChatRoomId;
  const db = sb as any;

  const tryDelete = async (table: string, col: string) => {
    const { error } = await db.from(table).delete().eq(col, roomId);
    if (error && !/does not exist|42P01/i.test(String(error.message ?? ""))) {
      return error.message as string;
    }
    return null;
  };

  const steps: [string, string][] = [
    ["chat_messages", "room_id"],
    ["chat_room_participants", "room_id"],
    ["chat_event_logs", "room_id"],
  ];
  for (const [t, c] of steps) {
    const err = await tryDelete(t, c);
    if (err) return { ok: false, error: `${t}: ${err}` };
  }

  const { error: crErr } = await db.from("chat_rooms").delete().eq("id", roomId);
  if (crErr) {
    return { ok: false, error: crErr.message ?? "chat_rooms 삭제 실패" };
  }
  return { ok: true };
}

export async function DELETE(req: Request, ctx: { params: Promise<{ meetingId: string; mcrId: string }> }) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  let body: { reason?: unknown; confirmText?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json(
      { ok: false, error: "reason_required", reasonMinLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH },
      { status: 400 }
    );
  }
  if (String(body.confirmText ?? "").trim() !== CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT) {
    return NextResponse.json({ ok: false, error: "confirm_mismatch" }, { status: 400 });
  }

  const { meetingId, mcrId } = await ctx.params;
  const mid = meetingId?.trim();
  const metaId = mcrId?.trim();
  if (!mid || !metaId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meet, error: meetErr } = await sb
    .from("meetings")
    .select("id, chat_room_id")
    .eq("id", mid)
    .maybeSingle();
  if (meetErr || !meet) {
    return NextResponse.json({ ok: false, error: "meeting_not_found" }, { status: 404 });
  }
  const mainChatId = (meet as { chat_room_id?: string | null }).chat_room_id
    ? String((meet as { chat_room_id: string }).chat_room_id)
    : null;

  const { data: mcr, error: mcrErr } = await sb
    .from("meeting_chat_rooms")
    .select("id, meeting_id, linked_chat_room_id")
    .eq("id", metaId)
    .eq("meeting_id", mid)
    .maybeSingle();

  if (mcrErr) {
    const msg = String(mcrErr.message ?? "");
    if (mcrErr.code === "42P01" || msg.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "schema_missing", detail: msg }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  if (!mcr) {
    return NextResponse.json({ ok: false, error: "meeting_chat_room_not_found" }, { status: 404 });
  }

  const linked = String((mcr as { linked_chat_room_id: string }).linked_chat_room_id ?? "");
  if (!linked) {
    return NextResponse.json({ ok: false, error: "invalid_link" }, { status: 400 });
  }
  if (mainChatId && linked === mainChatId) {
    return NextResponse.json({ ok: false, error: "cannot_delete_main_chat" }, { status: 400 });
  }

  const evidence = await lookupChatRoomEvidence(sb, [linked]);
  if (!evidence.ok) {
    return NextResponse.json({ ok: false, error: evidence.error }, { status: 500 });
  }
  if (evidence.evidenceRoomIds.has(linked)) {
    return NextResponse.json({ ok: false, error: "evidence_preserved" }, { status: 409 });
  }

  const result = await deleteLinkedChatRoom(sb, linked);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  await appendAdminRouteAudit(sb, req, {
    actorId: admin.actor.userId,
    targetType: "meeting_chat_room",
    targetId: linked,
    action: CHAT_ADMIN_AUDIT_HARD_DELETE,
    before: { meetingId: mid, meetingChatRoomId: metaId, linkedChatRoomId: linked, evidenceCounts: evidence.counts },
    after: { reason, deleted: true, evidencePreserved: true },
  });

  return NextResponse.json({ ok: true, deleted_linked_chat_room_id: linked });
}
