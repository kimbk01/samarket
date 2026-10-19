/**
 * 채팅 Admin R1-A (C-5) — 메신저 조치 상태 조건 갱신 + audit_logs (before/after).
 * 서버 전용. 호출 전 라우트에서 `requireChatAdmin` + 사유 검증을 끝낸다.
 *
 * - 방 조치: 읽은 값과 같은 상태일 때만 갱신 (`eq(room_status, before)`·`eq(is_readonly, before)`), 아니면 409.
 * - 메시지 숨김/해제: `eq(is_hidden_by_admin, !hidden)` 조건, 0행이면 409.
 * - 신고 조치: 신고 상태 CAS 를 먼저 잡고(중복 클릭·동시 처리 409) 제재를 적용.
 * - 발송·참가자 생성·읽음 처리 없음.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  CHAT_ADMIN_AUDIT_MESSAGE_HIDE,
  CHAT_ADMIN_AUDIT_MESSAGE_UNHIDE,
  CHAT_ADMIN_AUDIT_REPORT_ACTION,
  cmReportNextStatus,
  cmReportTransitionAllowed,
  cmRoomActionAlreadyApplied,
  type CmReportAdminAction,
  type CmRoomAdminAction,
} from "@/lib/admin/chat-admin/chat-content-access-policy";

export type CasResult = { ok: true } | { ok: false; error: string; status: number };

type RoomRow = {
  id: string;
  room_status?: string | null;
  is_readonly?: boolean | null;
  admin_note?: string | null;
  moderated_by?: string | null;
  moderated_at?: string | null;
};

function roomPatchFor(action: CmRoomAdminAction): Record<string, unknown> {
  switch (action) {
    case "block_room":
      return { room_status: "blocked" };
    case "unblock_room":
    case "unarchive_room":
      return { room_status: "active" };
    case "archive_room":
      return { room_status: "archived" };
    case "readonly_on":
      return { is_readonly: true };
    case "readonly_off":
      return { is_readonly: false };
    default:
      return {};
  }
}

export async function runCmRoomActionCas(
  sb: SupabaseClient,
  req: Request,
  input: { roomId: string; adminUserId: string; action: CmRoomAdminAction; reason: string; source?: string }
): Promise<CasResult> {
  const { data: beforeData, error: readErr } = await sb
    .from("community_messenger_rooms")
    .select("id, room_status, is_readonly, admin_note, moderated_by, moderated_at")
    .eq("id", input.roomId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message, status: 500 };
  const before = beforeData as RoomRow | null;
  if (!before) return { ok: false, error: "room_not_found", status: 404 };
  if (cmRoomActionAlreadyApplied(before, input.action)) {
    return { ok: false, error: "stale_state", status: 409 };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ...roomPatchFor(input.action),
    moderated_by: input.adminUserId,
    moderated_at: now,
    admin_note: input.reason,
    updated_at: now,
  };
  let q = sb.from("community_messenger_rooms").update(patch).eq("id", input.roomId);
  q = before.room_status == null ? q.is("room_status", null) : q.eq("room_status", before.room_status);
  q = before.is_readonly == null ? q.is("is_readonly", null) : q.eq("is_readonly", before.is_readonly);
  const { data: updated, error } = await q.select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!updated || updated.length === 0) return { ok: false, error: "stale_state", status: 409 };

  await appendAdminRouteAudit(sb, req, {
    actorId: input.adminUserId,
    targetType: "community_messenger_room",
    targetId: input.roomId,
    action: `community_messenger_room.${input.action}`,
    before: {
      room_status: before.room_status ?? null,
      is_readonly: before.is_readonly ?? null,
      admin_note: before.admin_note ?? null,
      moderated_by: before.moderated_by ?? null,
      moderated_at: before.moderated_at ?? null,
    },
    after: { action: input.action, reason: input.reason, source: input.source ?? "admin_room_action", ...patch },
  });
  return { ok: true };
}

export async function runCmMessageHiddenCas(
  sb: SupabaseClient,
  req: Request,
  input: { roomId: string; messageId: string; adminUserId: string; hidden: boolean; reason: string; source?: string }
): Promise<CasResult> {
  const { data: updated, error } = await sb
    .from("community_messenger_messages")
    .update({ is_hidden_by_admin: input.hidden })
    .eq("room_id", input.roomId)
    .eq("id", input.messageId)
    .eq("is_hidden_by_admin", !input.hidden)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!updated || updated.length === 0) {
    const { data: exists } = await sb
      .from("community_messenger_messages")
      .select("id")
      .eq("room_id", input.roomId)
      .eq("id", input.messageId)
      .maybeSingle();
    return exists
      ? { ok: false, error: "stale_state", status: 409 }
      : { ok: false, error: "message_not_found", status: 404 };
  }
  await appendAdminRouteAudit(sb, req, {
    actorId: input.adminUserId,
    targetType: "community_messenger_message",
    targetId: input.messageId,
    action: input.hidden ? CHAT_ADMIN_AUDIT_MESSAGE_HIDE : CHAT_ADMIN_AUDIT_MESSAGE_UNHIDE,
    before: { roomId: input.roomId, is_hidden_by_admin: !input.hidden },
    after: {
      roomId: input.roomId,
      is_hidden_by_admin: input.hidden,
      reason: input.reason,
      source: input.source ?? "admin_message_action",
    },
  });
  return { ok: true };
}

type ReportRow = {
  id: string;
  report_type: string;
  room_id: string | null;
  message_id: string | null;
  status: string;
  admin_note?: string | null;
  assigned_admin_id?: string | null;
  handled_at?: string | null;
};

export async function runCmReportActionCas(
  sb: SupabaseClient,
  req: Request,
  input: { reportId: string; adminUserId: string; action: CmReportAdminAction; reason: string }
): Promise<CasResult & { sanctionError?: string }> {
  const { data: reportData, error: reportError } = await sb
    .from("community_messenger_reports")
    .select("id, report_type, room_id, message_id, status, admin_note, assigned_admin_id, handled_at")
    .eq("id", input.reportId)
    .maybeSingle();
  if (reportError) return { ok: false, error: reportError.message, status: 500 };
  const before = reportData as ReportRow | null;
  if (!before) return { ok: false, error: "report_not_found", status: 404 };
  if (!cmReportTransitionAllowed(before.status, input.action)) {
    return { ok: false, error: "stale_state", status: 409 };
  }
  if (input.action === "sanction_message_hide" && !before.message_id) {
    return { ok: false, error: "report_has_no_message", status: 400 };
  }
  if (input.action === "sanction_room_block" && !before.room_id) {
    return { ok: false, error: "report_has_no_room", status: 400 };
  }

  const now = new Date().toISOString();
  const nextStatus = cmReportNextStatus(input.action);
  const { data: claimed, error: claimErr } = await sb
    .from("community_messenger_reports")
    .update({
      status: nextStatus,
      admin_note: input.reason,
      assigned_admin_id: input.adminUserId,
      handled_at: now,
      updated_at: now,
    })
    .eq("id", input.reportId)
    .eq("status", before.status)
    .select("id");
  if (claimErr) return { ok: false, error: claimErr.message, status: 500 };
  if (!claimed || claimed.length === 0) return { ok: false, error: "stale_state", status: 409 };

  // 신고 상태를 먼저 잡은 뒤 제재 적용. 이미 숨김/차단 상태면 제재는 그대로 두고 성공으로 본다.
  let sanctionError: string | undefined;
  if (input.action === "sanction_message_hide" && before.room_id && before.message_id) {
    const r = await runCmMessageHiddenCas(sb, req, {
      roomId: before.room_id,
      messageId: before.message_id,
      adminUserId: input.adminUserId,
      hidden: true,
      reason: input.reason,
      source: `report:${input.reportId}`,
    });
    if (!r.ok && r.status !== 409) sanctionError = r.error;
  }
  if (input.action === "sanction_room_block" && before.room_id) {
    const r = await runCmRoomActionCas(sb, req, {
      roomId: before.room_id,
      adminUserId: input.adminUserId,
      action: "block_room",
      reason: input.reason,
      source: `report:${input.reportId}`,
    });
    if (!r.ok && r.status !== 409) sanctionError = r.error;
  }

  await appendAdminRouteAudit(sb, req, {
    actorId: input.adminUserId,
    targetType: "community_messenger_report",
    targetId: input.reportId,
    action: CHAT_ADMIN_AUDIT_REPORT_ACTION,
    before: {
      status: before.status,
      admin_note: before.admin_note ?? null,
      assigned_admin_id: before.assigned_admin_id ?? null,
      handled_at: before.handled_at ?? null,
      roomId: before.room_id,
      messageId: before.message_id,
    },
    after: {
      action: input.action,
      status: nextStatus,
      reason: input.reason,
      assigned_admin_id: input.adminUserId,
      handled_at: now,
      sanctionError: sanctionError ?? null,
    },
  });
  if (sanctionError) return { ok: false, error: sanctionError, status: 500, sanctionError };
  return { ok: true };
}
