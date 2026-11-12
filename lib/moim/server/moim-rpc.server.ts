import "server-only";

import { getSupabaseServer, type SupabaseServer } from "@/lib/chat/supabase-server";
import { toMoimErrorCode, type MoimErrorCode } from "@/lib/moim/moim-error-codes";
import type { MoimAction, MoimRole } from "@/lib/moim/moim-permission-contract";

/**
 * 모임 RPC 호출 (서버 전용, service_role). 모든 쓰기는 이 파일의 함수만 쓴다.
 * DB 함수가 권한·정원·차단·메신저 방 입장/퇴장을 한 트랜잭션에서 처리한다 (마이그레이션 20271112210000).
 */

export type MoimRpcResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: MoimErrorCode; detail?: string };

async function callMoimRpc<T extends Record<string, unknown>>(
  fn: string,
  args: Record<string, unknown>,
  sb?: SupabaseServer
): Promise<MoimRpcResult<T>> {
  const client = sb ?? getSupabaseServer();
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    return { ok: false, error: toMoimErrorCode(error.message), detail: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return { ok: false, error: toMoimErrorCode(row.error) };
  }
  return { ok: true, ...(row as T) };
}

export type MoimCreateInput = {
  name: string;
  intro: string;
  categoryId: string;
  /** 직접 주제 카테고리(「기타」)일 때만 쓰인다 — 그 외 카테고리면 서버가 비운다 */
  topicLabel?: string | null;
  joinMode: "instant" | "approval";
  capacity?: number | null;
  coverImageUrl?: string | null;
  ageMinBirthYear?: number | null;
  ageMaxBirthYear?: number | null;
  questions?: string[];
  nickname?: string;
  avatarUrl?: string | null;
  bio?: string;
};

export function moimCreate(actorId: string, input: MoimCreateInput, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; room_id: string }>(
    "moim_create",
    {
      p_actor: actorId,
      p: {
        name: input.name,
        intro: input.intro,
        category_id: input.categoryId,
        topic_label: input.topicLabel ?? null,
        join_mode: input.joinMode,
        capacity: input.capacity ?? null,
        cover_image_url: input.coverImageUrl ?? null,
        age_min_birth_year: input.ageMinBirthYear ?? null,
        age_max_birth_year: input.ageMaxBirthYear ?? null,
        questions: input.questions ?? [],
        nickname: input.nickname ?? null,
        avatar_url: input.avatarUrl ?? null,
        bio: input.bio ?? "",
      },
    },
    sb
  );
}

export type MoimMemberProfileInput = { nickname?: string; avatarUrl?: string | null; bio?: string };

function profilePayload(profile?: MoimMemberProfileInput, extra?: Record<string, unknown>) {
  return {
    ...(profile?.nickname !== undefined ? { nickname: profile.nickname } : {}),
    ...(profile?.avatarUrl !== undefined ? { avatar_url: profile.avatarUrl } : {}),
    ...(profile?.bio !== undefined ? { bio: profile.bio } : {}),
    ...(extra ?? {}),
  };
}

export function moimJoin(
  actorId: string,
  moimId: string,
  input: { answers?: string[]; profile?: MoimMemberProfileInput; /** 초대 링크로 들어온 경우 — 링크 사용 횟수 */ inviteToken?: string | null },
  sb?: SupabaseServer
) {
  return callMoimRpc<{ status: "active" | "pending"; room_id?: string; request_id?: string }>(
    "moim_join",
    {
      p_actor: actorId,
      p_moim: moimId,
      p: profilePayload(input.profile, { answers: input.answers ?? [], invite_token: input.inviteToken ?? null }),
    },
    sb
  );
}

export function moimJoinCancel(actorId: string, moimId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_join_cancel", { p_actor: actorId, p_moim: moimId }, sb);
}

export function moimJoinDecide(actorId: string, requestId: string, approve: boolean, reason: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; user_id: string; approved: boolean }>(
    "moim_join_decide",
    { p_actor: actorId, p_request: requestId, p_approve: approve, p_reason: reason },
    sb
  );
}

export function moimLeave(actorId: string, moimId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_leave", { p_actor: actorId, p_moim: moimId }, sb);
}

export function moimMemberRemove(
  actorId: string,
  moimId: string,
  targetUserId: string,
  ban: boolean,
  reason: string | null,
  sb?: SupabaseServer
) {
  return callMoimRpc(
    "moim_member_remove",
    { p_actor: actorId, p_moim: moimId, p_target: targetUserId, p_ban: ban, p_reason: reason },
    sb
  );
}

export function moimMemberUnban(actorId: string, moimId: string, targetUserId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_member_unban", { p_actor: actorId, p_moim: moimId, p_target: targetUserId }, sb);
}

export function moimMemberRoleSet(
  actorId: string,
  moimId: string,
  targetUserId: string,
  role: Exclude<MoimRole, "host">,
  sb?: SupabaseServer
) {
  return callMoimRpc(
    "moim_member_role_set",
    { p_actor: actorId, p_moim: moimId, p_target: targetUserId, p_role: role },
    sb
  );
}

export function moimHostTransferRequest(actorId: string, moimId: string, toUserId: string, sb?: SupabaseServer) {
  return callMoimRpc<{ transfer_id: string }>(
    "moim_host_transfer_request",
    { p_actor: actorId, p_moim: moimId, p_to: toUserId },
    sb
  );
}

export function moimHostTransferRespond(actorId: string, transferId: string, accept: boolean, sb?: SupabaseServer) {
  return callMoimRpc<{ accepted: boolean; moim_id?: string }>(
    "moim_host_transfer_respond",
    { p_actor: actorId, p_transfer: transferId, p_accept: accept },
    sb
  );
}

export function moimClose(actorId: string, moimId: string, confirmName: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_close", { p_actor: actorId, p_moim: moimId, p_confirm_name: confirmName }, sb);
}

export type MoimInfoPatch = Partial<{
  name: string;
  intro: string;
  categoryId: string;
  topicLabel: string | null;
  joinMode: "instant" | "approval";
  capacity: number | null;
  coverImageUrl: string | null;
  ageMinBirthYear: number | null;
  ageMaxBirthYear: number | null;
  questions: string[];
}>;

export function moimUpdateInfo(
  actorId: string,
  moimId: string,
  patch: MoimInfoPatch,
  expectedUpdatedAt: string,
  sb?: SupabaseServer
) {
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name;
  if (patch.intro !== undefined) p.intro = patch.intro;
  if (patch.categoryId !== undefined) p.category_id = patch.categoryId;
  if (patch.topicLabel !== undefined) p.topic_label = patch.topicLabel ?? "";
  if (patch.joinMode !== undefined) p.join_mode = patch.joinMode;
  if (patch.capacity !== undefined) p.capacity = patch.capacity;
  if (patch.coverImageUrl !== undefined) p.cover_image_url = patch.coverImageUrl;
  if (patch.ageMinBirthYear !== undefined) p.age_min_birth_year = patch.ageMinBirthYear;
  if (patch.ageMaxBirthYear !== undefined) p.age_max_birth_year = patch.ageMaxBirthYear;
  if (patch.questions !== undefined) p.questions = patch.questions;
  return callMoimRpc<{ updated_at: string }>(
    "moim_update_info",
    { p_actor: actorId, p_moim: moimId, p, p_expected_updated_at: expectedUpdatedAt },
    sb
  );
}

export function moimPermissionsSet(
  actorId: string,
  moimId: string,
  overrides: Partial<Record<MoimAction, MoimRole>>,
  sb?: SupabaseServer
) {
  return callMoimRpc("moim_permissions_set", { p_actor: actorId, p_moim: moimId, p: overrides }, sb);
}

export function moimProfileUpdate(actorId: string, moimId: string, profile: MoimMemberProfileInput, sb?: SupabaseServer) {
  return callMoimRpc("moim_profile_update", { p_actor: actorId, p_moim: moimId, p: profilePayload(profile) }, sb);
}

export function moimInviteLinkCreate(actorId: string, moimId: string, expiresAt: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ invite_id: string; token: string }>(
    "moim_invite_link_create",
    { p_actor: actorId, p_moim: moimId, p_expires_at: expiresAt },
    sb
  );
}

export function moimInviteLinkRevoke(actorId: string, inviteId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_invite_link_revoke", { p_actor: actorId, p_invite: inviteId }, sb);
}

export function moimInviteLinkResolve(token: string, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; inviter_id: string }>("moim_invite_link_resolve", { p_token: token }, sb);
}

export function moimInviteSend(actorId: string, moimId: string, inviteeUserId: string, sb?: SupabaseServer) {
  return callMoimRpc<{ invite_target_id: string }>(
    "moim_invite_send",
    { p_actor: actorId, p_moim: moimId, p_invitee: inviteeUserId },
    sb
  );
}

export function moimInviteRespond(
  actorId: string,
  inviteTargetId: string,
  accept: boolean,
  profile?: MoimMemberProfileInput,
  sb?: SupabaseServer
) {
  return callMoimRpc<{ status: "active" | "pending" | "declined"; moim_id?: string }>(
    "moim_invite_respond",
    { p_actor: actorId, p_invite_target: inviteTargetId, p_accept: accept, p: profilePayload(profile) },
    sb
  );
}

// ---------------------------------------------------------------------------
// M3 — 게시판·글·댓글·메모·신고 (migration 20271112230000)
// ---------------------------------------------------------------------------

export type MoimPostInput = {
  boardId: string;
  title?: string;
  body: string;
  images?: string[];
  visibility?: "members" | "public";
};

export function moimPostCreate(actorId: string, moimId: string, input: MoimPostInput, sb?: SupabaseServer) {
  return callMoimRpc<{ post_id: string; board_kind: string }>(
    "moim_post_create",
    {
      p_actor: actorId,
      p_moim: moimId,
      p: {
        board_id: input.boardId,
        title: input.title ?? "",
        body: input.body,
        images: input.images ?? [],
        visibility: input.visibility ?? "members",
      },
    },
    sb
  );
}

export function moimPostUpdate(
  actorId: string,
  postId: string,
  patch: Partial<{ title: string; body: string; images: string[]; visibility: "members" | "public" }>,
  sb?: SupabaseServer
) {
  return callMoimRpc("moim_post_update", { p_actor: actorId, p_post: postId, p: patch }, sb);
}

export function moimPostRemove(actorId: string, postId: string, reason: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ result: "deleted" | "hidden"; author_id?: string }>(
    "moim_post_remove",
    { p_actor: actorId, p_post: postId, p_reason: reason },
    sb
  );
}

export function moimPostPin(actorId: string, postId: string, pinned: boolean, sb?: SupabaseServer) {
  return callMoimRpc("moim_post_pin", { p_actor: actorId, p_post: postId, p_pinned: pinned }, sb);
}

export function moimCommentCreate(actorId: string, postId: string, body: string, sb?: SupabaseServer) {
  return callMoimRpc<{ comment_id: string; post_author_id: string; moim_id: string }>(
    "moim_comment_create",
    { p_actor: actorId, p_post: postId, p_body: body },
    sb
  );
}

export function moimCommentRemove(actorId: string, commentId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_comment_remove", { p_actor: actorId, p_comment: commentId }, sb);
}

export function moimBoardUpsert(
  actorId: string,
  moimId: string,
  input: Partial<{ boardId: string; name: string; writeMinRole: MoimRole; isActive: boolean }>,
  sb?: SupabaseServer
) {
  const p: Record<string, unknown> = {};
  if (input.boardId) p.board_id = input.boardId;
  if (input.name !== undefined) p.name = input.name;
  if (input.writeMinRole !== undefined) p.write_min_role = input.writeMinRole;
  if (input.isActive !== undefined) p.is_active = input.isActive;
  return callMoimRpc<{ board_id: string }>("moim_board_upsert", { p_actor: actorId, p_moim: moimId, p }, sb);
}

export function moimMemberNoteSet(actorId: string, moimId: string, targetUserId: string, body: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_member_note_set", { p_actor: actorId, p_moim: moimId, p_target: targetUserId, p_body: body }, sb);
}

export const MOIM_REPORT_TARGET_TYPES = ["moim", "member", "post", "comment", "schedule", "album", "chat_message"] as const;
export type MoimReportTargetType = (typeof MOIM_REPORT_TARGET_TYPES)[number];

export function moimReportCreate(
  actorId: string,
  moimId: string,
  input: { targetType: MoimReportTargetType; targetId: string; reasonCode: string; detail?: string | null },
  sb?: SupabaseServer
) {
  return callMoimRpc<{ report_id: string }>(
    "moim_report_create",
    {
      p_actor: actorId,
      p_moim: moimId,
      p: { target_type: input.targetType, target_id: input.targetId, reason_code: input.reasonCode, detail: input.detail ?? null },
    },
    sb
  );
}

// ---------------------------------------------------------------------------
// M4 — 일정·앨범·모임별 알림 설정 (migration 20271113100000)
// ---------------------------------------------------------------------------
export type MoimScheduleInput = Partial<{
  title: string;
  startsAt: string;
  endsAt: string | null;
  placeText: string;
  placeLat: number | null;
  placeLng: number | null;
  description: string;
  images: string[];
  capacity: number | null;
  joinMode: "first_come" | "approval";
  askMotivation: boolean;
}>;

function schedulePayload(input: MoimScheduleInput): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (input.title !== undefined) p.title = input.title;
  if (input.startsAt !== undefined) p.starts_at = input.startsAt;
  if (input.endsAt !== undefined) p.ends_at = input.endsAt;
  if (input.placeText !== undefined) p.place_text = input.placeText;
  if (input.placeLat !== undefined) p.place_lat = input.placeLat;
  if (input.placeLng !== undefined) p.place_lng = input.placeLng;
  if (input.description !== undefined) p.description = input.description;
  if (input.images !== undefined) p.images = input.images;
  if (input.capacity !== undefined) p.capacity = input.capacity;
  if (input.joinMode !== undefined) p.join_mode = input.joinMode;
  if (input.askMotivation !== undefined) p.ask_motivation = input.askMotivation;
  return p;
}

export function moimScheduleCreate(actorId: string, moimId: string, input: MoimScheduleInput, sb?: SupabaseServer) {
  return callMoimRpc<{ schedule_id: string; room_id: string }>(
    "moim_schedule_create",
    { p_actor: actorId, p_moim: moimId, p: schedulePayload(input) },
    sb
  );
}

export function moimScheduleUpdate(actorId: string, scheduleId: string, input: MoimScheduleInput, sb?: SupabaseServer) {
  return callMoimRpc("moim_schedule_update", { p_actor: actorId, p_schedule: scheduleId, p: schedulePayload(input) }, sb);
}

export function moimScheduleCancel(actorId: string, scheduleId: string, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; notify_user_ids: string[]; title: string }>(
    "moim_schedule_cancel",
    { p_actor: actorId, p_schedule: scheduleId },
    sb
  );
}

export function moimScheduleSetClosed(actorId: string, scheduleId: string, closed: boolean, sb?: SupabaseServer) {
  return callMoimRpc("moim_schedule_set_closed", { p_actor: actorId, p_schedule: scheduleId, p_closed: closed }, sb);
}

export function moimScheduleJoin(actorId: string, scheduleId: string, motivation: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ status: "confirmed" | "requested"; room_id?: string; host_user_id?: string; moim_id?: string; title?: string }>(
    "moim_schedule_join",
    { p_actor: actorId, p_schedule: scheduleId, p_motivation: motivation },
    sb
  );
}

export function moimScheduleLeave(actorId: string, scheduleId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_schedule_leave", { p_actor: actorId, p_schedule: scheduleId }, sb);
}

export function moimScheduleDecide(actorId: string, scheduleId: string, userId: string, approve: boolean, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; title: string; approved: boolean }>(
    "moim_schedule_decide",
    { p_actor: actorId, p_schedule: scheduleId, p_user: userId, p_approve: approve },
    sb
  );
}

export function moimScheduleRemoveParticipant(actorId: string, scheduleId: string, userId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_schedule_remove_participant", { p_actor: actorId, p_schedule: scheduleId, p_user: userId }, sb);
}

export function moimScheduleAttendance(
  actorId: string,
  scheduleId: string,
  userId: string,
  attendance: "unknown" | "present" | "absent",
  sb?: SupabaseServer
) {
  return callMoimRpc("moim_schedule_attendance", { p_actor: actorId, p_schedule: scheduleId, p_user: userId, p_attendance: attendance }, sb);
}

export type MoimScheduleBatchItem = { schedule_id: string; moim_id: string; title: string; user_ids: string[]; starts_at?: string };

export function moimSchedulesFinishDue(limit: number, sb?: SupabaseServer) {
  return callMoimRpc<{ done: MoimScheduleBatchItem[] }>("moim_schedules_finish_due", { p_limit: limit }, sb);
}

export function moimSchedulesClaimReminders(window: "24h" | "1h", sb?: SupabaseServer) {
  return callMoimRpc<{ reminders: MoimScheduleBatchItem[] }>("moim_schedules_claim_reminders", { p_window: window }, sb);
}

export function moimAlbumAdd(actorId: string, moimId: string, urls: string[], scheduleId: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ added: number }>(
    "moim_album_add",
    { p_actor: actorId, p_moim: moimId, p: { urls, schedule_id: scheduleId } },
    sb
  );
}

export function moimAlbumRemove(actorId: string, itemId: string, sb?: SupabaseServer) {
  return callMoimRpc<{ result: "deleted" | "hidden" }>("moim_album_remove", { p_actor: actorId, p_item: itemId }, sb);
}

export function moimAlbumPin(actorId: string, itemId: string, pinned: boolean, sb?: SupabaseServer) {
  return callMoimRpc("moim_album_pin", { p_actor: actorId, p_item: itemId, p_pinned: pinned }, sb);
}

export function moimNotificationPrefsSet(
  actorId: string,
  moimId: string,
  prefs: Partial<{ notice: boolean; posts: boolean; schedules: boolean }>,
  sb?: SupabaseServer
) {
  return callMoimRpc("moim_notification_prefs_set", { p_actor: actorId, p_moim: moimId, p: prefs }, sb);
}

// ---------------------------------------------------------------------------
// M5 — 미접속 모임장 변경 요청 · 어드민 (migration 20271113200000)
// 어드민 권한(권한 키 moim · 삭제는 최고관리자)은 API 가 판정하고 p_admin 으로 넘긴다. 모든 어드민 쓰기는 사유 필수.
// ---------------------------------------------------------------------------

export function moimHostInactiveRequest(actorId: string, moimId: string, toUserId: string, reason: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ transfer_id: string }>(
    "moim_host_inactive_request",
    { p_actor: actorId, p_moim: moimId, p_to: toUserId, p_reason: reason },
    sb
  );
}

export type MoimAdminInfoPatch = Partial<{
  name: string;
  intro: string;
  coverImageUrl: string | null;
  categoryId: string;
  topicLabel: string | null;
  capacity: number | null;
  joinMode: "instant" | "approval";
  lguId: string;
  questions: string[];
}>;

export function moimAdminUpdateInfo(
  adminId: string,
  moimId: string,
  patch: MoimAdminInfoPatch,
  expectedUpdatedAt: string,
  reason: string,
  sb?: SupabaseServer
) {
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name;
  if (patch.intro !== undefined) p.intro = patch.intro;
  if (patch.coverImageUrl !== undefined) p.cover_image_url = patch.coverImageUrl ?? "";
  if (patch.categoryId !== undefined) p.category_id = patch.categoryId;
  if (patch.topicLabel !== undefined) p.topic_label = patch.topicLabel ?? "";
  if (patch.capacity !== undefined) p.capacity = patch.capacity;
  if (patch.joinMode !== undefined) p.join_mode = patch.joinMode;
  if (patch.lguId !== undefined) p.lgu_id = patch.lguId;
  if (patch.questions !== undefined) p.questions = patch.questions;
  return callMoimRpc<{ updated_at: string; host_user_id: string; name: string }>(
    "moim_admin_update_info",
    { p_admin: adminId, p_moim: moimId, p, p_expected_updated_at: expectedUpdatedAt, p_reason: reason },
    sb
  );
}

export function moimAdminMemberRole(adminId: string, moimId: string, userId: string, role: Exclude<MoimRole, "host">, reason: string, sb?: SupabaseServer) {
  return callMoimRpc<{ changed: boolean }>(
    "moim_admin_member_role",
    { p_admin: adminId, p_moim: moimId, p_user: userId, p_role: role, p_reason: reason },
    sb
  );
}

export function moimAdminMemberRemove(adminId: string, moimId: string, userId: string, ban: boolean, reason: string, sb?: SupabaseServer) {
  return callMoimRpc<{ was_active: boolean }>(
    "moim_admin_member_remove",
    { p_admin: adminId, p_moim: moimId, p_user: userId, p_ban: ban, p_reason: reason },
    sb
  );
}

export function moimAdminMemberUnban(adminId: string, moimId: string, userId: string, reason: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_admin_member_unban", { p_admin: adminId, p_moim: moimId, p_user: userId, p_reason: reason }, sb);
}

export function moimAdminAssignHost(adminId: string, moimId: string, toUserId: string, reason: string, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; from_user_id: string; notify_user_ids: string[] }>(
    "moim_admin_assign_host",
    { p_admin: adminId, p_moim: moimId, p_to: toUserId, p_reason: reason },
    sb
  );
}

export function moimAdminHostRequestDecide(adminId: string, transferId: string, approve: boolean, reason: string, sb?: SupabaseServer) {
  return callMoimRpc<{
    approved: boolean;
    moim_id: string;
    requester_id: string | null;
    from_user_id?: string;
    to_user_id?: string;
    notify_user_ids?: string[];
  }>("moim_admin_host_request_decide", { p_admin: adminId, p_transfer: transferId, p_approve: approve, p_reason: reason }, sb);
}

export type MoimAdminContentType = "post" | "comment" | "album" | "schedule";
/** restore = 숨김 해제 · undelete = 삭제 복구(최고관리자) · cancel = 일정만 */
export type MoimAdminContentAction = "hide" | "restore" | "delete" | "undelete" | "cancel";

export function moimAdminContent(
  adminId: string,
  type: MoimAdminContentType,
  id: string,
  action: MoimAdminContentAction,
  reason: string,
  sb?: SupabaseServer
) {
  return callMoimRpc<{ moim_id: string; status?: string; title?: string; notify_user_ids?: string[] }>(
    "moim_admin_content",
    { p_admin: adminId, p_type: type, p_id: id, p_action: action, p_reason: reason },
    sb
  );
}

export type MoimSanctionLevel = "unlist" | "warn" | "block";

export function moimAdminSanctionApply(
  adminId: string,
  moimId: string,
  input: { level: MoimSanctionLevel; reasonCode: string; reason: string; endsAt: string | null },
  sb?: SupabaseServer
) {
  return callMoimRpc<{ sanction_id: string; platform_state: string; host_user_id: string; notify_user_ids: string[]; name: string }>(
    "moim_admin_sanction_apply",
    {
      p_admin: adminId,
      p_moim: moimId,
      p_level: input.level,
      p_reason_code: input.reasonCode,
      p_reason: input.reason,
      p_ends_at: input.endsAt,
    },
    sb
  );
}

export function moimAdminSanctionRevoke(adminId: string, sanctionId: string, reason: string, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; platform_state: string }>(
    "moim_admin_sanction_revoke",
    { p_admin: adminId, p_sanction: sanctionId, p_reason: reason },
    sb
  );
}

// ── M6 신고 처리 (20271113400000) ──────────────────────────────────────────

/** 검토 시작 (접수 → 검토 중) — 접수가 아니면 moim_conflict */
export function moimAdminReportReview(adminId: string, reportId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_admin_report_review", { p_admin: adminId, p_report: reportId }, sb);
}

export type MoimAdminReportDecision = "actioned" | "dismissed";

export type MoimAdminReportDecideInput = {
  expectedStatus: "received" | "reviewing";
  decision: MoimAdminReportDecision;
  reason: string;
  contentHide: boolean;
  moimLevel: MoimSanctionLevel | null;
  moimEndsAt: string | null;
  userRestrict: { who: "target" | "host"; restriction: "post" | "comment" | "all"; days: number | null } | null;
  closeSameTarget: boolean;
};

export type MoimAdminReportDecideAction = {
  kind: string;
  sanction_id: string;
  platform_state?: string;
  user_id?: string;
  community_sanction_id?: string | null;
  duplicate?: boolean;
  restriction?: "post" | "comment" | "all";
  days?: number | null;
  end_at?: string | null;
};

export function moimAdminReportDecide(adminId: string, reportId: string, input: MoimAdminReportDecideInput, sb?: SupabaseServer) {
  return callMoimRpc<{
    status: MoimAdminReportDecision;
    moim_id: string;
    moim_name: string | null;
    host_user_id: string | null;
    target_type: string;
    target_id: string;
    target_owner_id: string | null;
    reporter_ids: string[];
    closed_report_ids: string[];
    actions: MoimAdminReportDecideAction[];
    moim_level: MoimSanctionLevel | null;
    moim_notify_user_ids: string[];
    chat_room_id: string | null;
    schedule_title: string | null;
    schedule_notify_user_ids: string[];
  }>(
    "moim_admin_report_decide",
    {
      p_admin: adminId,
      p_report: reportId,
      p_expected_status: input.expectedStatus,
      p_decision: input.decision,
      p_reason: input.reason,
      p: {
        content_hide: input.contentHide,
        moim_level: input.moimLevel,
        moim_ends_at: input.moimEndsAt,
        user_restrict: input.userRestrict,
        close_same_target: input.closeSameTarget,
      },
    },
    sb
  );
}

export function moimSanctionsExpireDue(limit: number, sb?: SupabaseServer) {
  return callMoimRpc<{ refreshed: { moim_id: string; platform_state: string }[] }>("moim_sanctions_expire_due", { p_limit: limit }, sb);
}

/** 운영 정책 실행 (예약 작업) — 정책 값이 NULL 이면 서버가 아무것도 하지 않는다 */
export function moimJoinRequestsExpireDue(limit: number, sb?: SupabaseServer) {
  return callMoimRpc<{ expired: number; policy: number | null }>("moim_join_requests_expire_due", { p_limit: limit }, sb);
}

export function moimScheduleRoomsArchiveDue(limit: number, sb?: SupabaseServer) {
  return callMoimRpc<{ archived: number; policy: number | null }>("moim_schedule_rooms_archive_due", { p_limit: limit }, sb);
}

export function moimClosedRetentionDue(limit: number, sb?: SupabaseServer) {
  return callMoimRpc<{ ended: number; policy: number | null }>("moim_closed_retention_due", { p_limit: limit }, sb);
}

export function moimAdminDelete(adminId: string, moimId: string, reason: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_admin_delete", { p_admin: adminId, p_moim: moimId, p_reason: reason }, sb);
}

export function moimAdminRestore(adminId: string, moimId: string, reason: string, sb?: SupabaseServer) {
  return callMoimRpc<{ status: string }>("moim_admin_restore", { p_admin: adminId, p_moim: moimId, p_reason: reason }, sb);
}

export type MoimAdminCategoryInput = {
  id?: string | null;
  slug: string;
  labelKo: string;
  labelEn: string;
  sortOrder: number;
  isActive: boolean;
  isRestricted: boolean;
  /** 생략 = 새 카테고리는 끔·기존 카테고리는 그대로 */
  allowCustomTopic?: boolean;
  expectedUpdatedAt?: string | null;
};

export function moimAdminCategorySave(adminId: string, input: MoimAdminCategoryInput, reason: string, sb?: SupabaseServer) {
  return callMoimRpc<{ category_id: string; updated_at: string }>(
    "moim_admin_category_save",
    {
      p_admin: adminId,
      p: {
        ...(input.id ? { id: input.id } : {}),
        slug: input.slug,
        label_ko: input.labelKo,
        label_en: input.labelEn,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        is_restricted: input.isRestricted,
        ...(typeof input.allowCustomTopic === "boolean" ? { allow_custom_topic: input.allowCustomTopic } : {}),
        ...(input.expectedUpdatedAt ? { expected_updated_at: input.expectedUpdatedAt } : {}),
      },
      p_reason: reason,
    },
    sb
  );
}

export function moimAdminPoliciesSave(
  adminId: string,
  patch: Record<string, number | null | string[]>,
  expectedUpdatedAt: string,
  reason: string,
  sb?: SupabaseServer
) {
  return callMoimRpc<{ updated_at: string }>(
    "moim_admin_policies_save",
    { p_admin: adminId, p: patch, p_expected_updated_at: expectedUpdatedAt, p_reason: reason },
    sb
  );
}
