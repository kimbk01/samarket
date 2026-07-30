import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  plannedColumnsForGroup,
  roomDomainInsertColumns,
} from "@/lib/chat-domain/domain-identity-legacy-map";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type {
  GroupParticipantRow,
  GroupRoomRow,
  GroupRoomRole,
  GroupRoomSettingsPatch,
} from "@/lib/community-messenger/group/group-room.types";
import { generateGroupInviteToken } from "@/lib/community-messenger/group/group-room-invite-token";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type GroupRoomSupabase = SupabaseClient<any>;

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTableError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|relation .* does not exist/i.test(msg);
}

export function resolveGroupRoomSupabase(): GroupRoomSupabase | null {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

export function dedupeGroupMemberIds(values: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = trimText(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function insertPrivateGroupRoom(
  sb: GroupRoomSupabase,
  input: { userId: string; title: string }
): Promise<{ ok: true; roomId: string } | { ok: false; error: string; missingTable?: boolean }> {
  const title = trimText(input.title);
  /** Pre-allocate id so group:{roomId} identity is atomic with chat_domain (prod NOT NULL). */
  const roomId = randomUUID();
  const domainCols = roomDomainInsertColumns(plannedColumnsForGroup(roomId));
  const { data, error } = await (sb as any)
    .from("community_messenger_rooms")
    .insert({
      id: roomId,
      room_type: "private_group",
      room_status: "active",
      visibility: "private",
      join_policy: "invite_only",
      is_readonly: false,
      created_by: input.userId,
      owner_user_id: input.userId,
      title,
      summary: "",
      is_discoverable: false,
      allow_member_invite: true,
      notice_text: "",
      allow_admin_invite: true,
      allow_admin_kick: true,
      allow_admin_edit_notice: true,
      allow_member_upload: true,
      allow_member_call: true,
      last_message: "",
      last_message_type: "system",
      invite_token: generateGroupInviteToken(),
      invite_link_enabled: true,
      chat_domain: domainCols.chat_domain,
      domain_identity: domainCols.domain_identity,
      domain_identity_key: domainCols.domain_identity_key,
    })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error: String(error.message ?? "group_create_failed"),
      missingTable: isMissingTableError(error),
    };
  }
  const insertedId = trimText((data as { id?: string } | null)?.id) || roomId;
  if (!insertedId) return { ok: false, error: "group_create_failed" };
  return { ok: true, roomId: insertedId };
}

export async function insertGroupParticipants(
  sb: GroupRoomSupabase,
  input: { roomId: string; ownerUserId: string; memberIds: string[] }
): Promise<{ ok: true } | { ok: false; error: string; missingTable?: boolean }> {
  const memberIds = dedupeGroupMemberIds([input.ownerUserId, ...input.memberIds]);
  const rows = memberIds.map((memberId) => ({
    room_id: input.roomId,
    user_id: memberId,
    role: (memberId === input.ownerUserId ? "owner" : "member") as GroupRoomRole,
  }));
  const { error } = await (sb as any).from("community_messenger_participants").insert(rows);
  if (error) {
    return {
      ok: false,
      error: String(error.message ?? "group_participant_create_failed"),
      missingTable: isMissingTableError(error),
    };
  }
  return { ok: true };
}

export async function insertGroupSystemMessage(
  sb: GroupRoomSupabase,
  input: { roomId: string; content: string; createdAt?: string }
): Promise<{ ok: true; createdAt: string } | { ok: false; error: string }> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const createdAt = trimText(input.createdAt) || new Date().toISOString();
  const { error: insertError } = await (sb as any).from("community_messenger_messages").insert({
    room_id: roomId,
    sender_id: null,
    message_type: "system",
    content,
    metadata: {},
    created_at: createdAt,
  });
  if (insertError) {
    return { ok: false, error: String(insertError.message ?? "message_send_failed") };
  }
  await (sb as any)
    .from("community_messenger_rooms")
    .update({
      last_message: content,
      last_message_at: createdAt,
      last_message_type: "system",
      updated_at: createdAt,
    })
    .eq("id", roomId);
  return { ok: true, createdAt };
}

export async function fetchPrivateGroupRoom(
  sb: GroupRoomSupabase,
  roomId: string
): Promise<GroupRoomRow | null> {
  const id = trimText(roomId);
  if (!id) return null;
  const selectWithTombstone =
    "id, room_type, room_status, visibility, join_policy, is_readonly, created_by, owner_user_id, title, summary, avatar_url, is_discoverable, allow_member_invite, notice_text, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, last_message, last_message_at, last_message_type, deleted_at, deleted_by";
  const selectLegacy =
    "id, room_type, room_status, visibility, join_policy, is_readonly, created_by, owner_user_id, title, summary, avatar_url, is_discoverable, allow_member_invite, notice_text, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, last_message, last_message_at, last_message_type";
  let { data, error } = await (sb as any)
    .from("community_messenger_rooms")
    .select(selectWithTombstone)
    .eq("id", id)
    .maybeSingle();
  if (error && /deleted_at|column/i.test(String(error.message ?? ""))) {
    ({ data, error } = await (sb as any)
      .from("community_messenger_rooms")
      .select(selectLegacy)
      .eq("id", id)
      .maybeSingle());
  }
  if (error && !isMissingTableError(error)) return null;
  const row = data as GroupRoomRow | null;
  if (!row || row.room_type !== "private_group") return null;
  return row;
}

export async function fetchActiveParticipant(
  sb: GroupRoomSupabase,
  roomId: string,
  userId: string
): Promise<GroupParticipantRow | null> {
  const rid = trimText(roomId);
  const uid = trimText(userId);
  if (!rid || !uid) return null;
  const { data, error } = await (sb as any)
    .from("community_messenger_participants")
    .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, left_at")
    .eq("room_id", rid)
    .eq("user_id", uid)
    .is("left_at", null)
    .is("blocked_hidden_at", null)
    .maybeSingle();
  if (error && !isMissingTableError(error)) return null;
  return (data as GroupParticipantRow | null) ?? null;
}

export async function listMyPrivateGroupRooms(
  sb: GroupRoomSupabase,
  userId: string,
  limit = 200
): Promise<Array<GroupRoomRow & { participant: GroupParticipantRow }>> {
  const uid = trimText(userId);
  if (!uid) return [];
  const { data: participantRows, error: participantError } = await (sb as any)
    .from("community_messenger_participants")
    .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, left_at")
    .eq("user_id", uid)
    .is("left_at", null)
    .is("blocked_hidden_at", null)
    .limit(Math.max(1, Math.min(limit, 500)));
  if (participantError && !isMissingTableError(participantError)) return [];
  const participants = (participantRows ?? []) as GroupParticipantRow[];
  const roomIds = dedupeGroupMemberIds(participants.map((row) => row.room_id));
  if (!roomIds.length) return [];
  const listSelectTombstone =
    "id, room_type, room_status, visibility, join_policy, is_readonly, created_by, owner_user_id, title, summary, is_discoverable, allow_member_invite, notice_text, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, last_message, last_message_at, last_message_type, deleted_at, deleted_by";
  const listSelectLegacy =
    "id, room_type, room_status, visibility, join_policy, is_readonly, created_by, owner_user_id, title, summary, is_discoverable, allow_member_invite, notice_text, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, last_message, last_message_at, last_message_type";
  let { data: roomRows, error: roomError } = await (sb as any)
    .from("community_messenger_rooms")
    .select(listSelectTombstone)
    .in("id", roomIds)
    .eq("room_type", "private_group")
    .is("deleted_at", null);
  if (roomError && /deleted_at|column/i.test(String(roomError.message ?? ""))) {
    ({ data: roomRows, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select(listSelectLegacy)
      .in("id", roomIds)
      .eq("room_type", "private_group"));
  }
  if (roomError && !isMissingTableError(roomError)) return [];
  const participantByRoom = new Map(participants.map((row) => [row.room_id, row]));
  const out: Array<GroupRoomRow & { participant: GroupParticipantRow }> = [];
  for (const row of (roomRows ?? []) as GroupRoomRow[]) {
    if (row.deleted_at) continue;
    const participant = participantByRoom.get(row.id);
    if (!participant) continue;
    out.push({ ...row, participant });
  }
  out.sort(
    (a, b) =>
      new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
  );
  return out.slice(0, limit);
}

export async function markParticipantLeft(
  sb: GroupRoomSupabase,
  roomId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const rid = trimText(roomId);
  const uid = trimText(userId);
  if (!rid || !uid) return { ok: false, error: "room_not_found" };
  const leftAt = new Date().toISOString();
  const { error } = await (sb as any)
    .from("community_messenger_participants")
    .update({ left_at: leftAt })
    .eq("room_id", rid)
    .eq("user_id", uid)
    .is("left_at", null);
  if (error) {
    if (isMissingTableError(error)) {
      const { error: delErr } = await (sb as any)
        .from("community_messenger_participants")
        .delete()
        .eq("room_id", rid)
        .eq("user_id", uid);
      if (delErr) return { ok: false, error: String(delErr.message ?? "leave_failed") };
      return { ok: true };
    }
    return { ok: false, error: String(error.message ?? "leave_failed") };
  }
  return { ok: true };
}

export async function patchGroupRoomSettings(
  sb: GroupRoomSupabase,
  roomId: string,
  patch: GroupRoomSettingsPatch
): Promise<{ ok: boolean; error?: string }> {
  const rid = trimText(roomId);
  if (!rid) return { ok: false, error: "room_not_found" };
  const dbPatch: Record<string, unknown> = {};
  if (typeof patch.title === "string") dbPatch.title = trimText(patch.title);
  if (typeof patch.noticeText === "string") dbPatch.notice_text = trimText(patch.noticeText).slice(0, 2000);
  if (typeof patch.allowMemberInvite === "boolean") dbPatch.allow_member_invite = patch.allowMemberInvite;
  if (typeof patch.allowAdminInvite === "boolean") dbPatch.allow_admin_invite = patch.allowAdminInvite;
  if (typeof patch.allowAdminKick === "boolean") dbPatch.allow_admin_kick = patch.allowAdminKick;
  if (typeof patch.allowAdminEditNotice === "boolean") dbPatch.allow_admin_edit_notice = patch.allowAdminEditNotice;
  if (typeof patch.allowMemberUpload === "boolean") dbPatch.allow_member_upload = patch.allowMemberUpload;
  if (typeof patch.allowMemberCall === "boolean") dbPatch.allow_member_call = patch.allowMemberCall;
  if (!Object.keys(dbPatch).length) return { ok: true };
  const { error } = await (sb as any).from("community_messenger_rooms").update(dbPatch).eq("id", rid);
  if (error) return { ok: false, error: String(error.message ?? "update_failed") };
  return { ok: true };
}

export async function patchParticipantMute(
  sb: GroupRoomSupabase,
  roomId: string,
  userId: string,
  isMuted: boolean
): Promise<{ ok: boolean; error?: string }> {
  const rid = trimText(roomId);
  const uid = trimText(userId);
  if (!rid || !uid) return { ok: false, error: "room_not_found" };
  const { error } = await (sb as any)
    .from("community_messenger_participants")
    .update({ is_muted: isMuted })
    .eq("room_id", rid)
    .eq("user_id", uid)
    .is("left_at", null);
  if (error) return { ok: false, error: String(error.message ?? "update_failed") };
  return { ok: true };
}

export async function countActiveOwners(sb: GroupRoomSupabase, roomId: string): Promise<number> {
  const rid = trimText(roomId);
  if (!rid) return 0;
  const { data, error } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", rid)
    .eq("role", "owner")
    .is("left_at", null);
  if (error && !isMissingTableError(error)) return 0;
  return Array.isArray(data) ? data.length : 0;
}

export type UpsertGroupMembersResult =
  | {
      ok: true;
      /** Inserted or reactivated (left_at cleared). Active rows are never mutated. */
      newlyInvitedMemberIds: string[];
      alreadyActiveMemberIds: string[];
    }
  | { ok: false; error: string };

/**
 * Invite / invite-link join SSOT.
 * - active (left_at null): no-op (do not demote admin/owner)
 * - inactive (left_at set): restore left_at=null, role=member (never restore admin/owner)
 * - missing row: insert member
 * Does not touch blocked_hidden_at.
 */
export async function upsertGroupMemberParticipants(
  sb: GroupRoomSupabase,
  roomId: string,
  memberIds: string[]
): Promise<UpsertGroupMembersResult> {
  const rid = trimText(roomId);
  const ids = dedupeGroupMemberIds(memberIds);
  if (!rid || !ids.length) return { ok: false, error: "members_required" };
  const { data: existingRows, error: existingError } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id, left_at, role")
    .eq("room_id", rid)
    .in("user_id", ids);
  if (existingError && !isMissingTableError(existingError)) {
    return { ok: false, error: String(existingError.message ?? "participant_lookup_failed") };
  }

  const byUser = new Map<string, { left_at: string | null; role: string }>();
  for (const row of (existingRows ?? []) as Array<{
    user_id?: string;
    left_at?: string | null;
    role?: string | null;
  }>) {
    const uid = trimText(row.user_id);
    if (!uid) continue;
    byUser.set(uid, { left_at: row.left_at ?? null, role: trimText(row.role) || "member" });
  }

  const alreadyActiveMemberIds: string[] = [];
  const toReactivate: string[] = [];
  const toInsert: string[] = [];
  for (const id of ids) {
    const existing = byUser.get(id);
    if (!existing) {
      toInsert.push(id);
      continue;
    }
    if (existing.left_at == null) {
      alreadyActiveMemberIds.push(id);
      continue;
    }
    toReactivate.push(id);
  }

  if (toReactivate.length > 0) {
    const { error: reactivateError } = await (sb as any)
      .from("community_messenger_participants")
      .update({ left_at: null, role: "member" })
      .eq("room_id", rid)
      .in("user_id", toReactivate)
      .not("left_at", "is", null);
    if (reactivateError) {
      return { ok: false, error: String(reactivateError.message ?? "invite_failed") };
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await (sb as any).from("community_messenger_participants").insert(
      toInsert.map((memberId) => ({
        room_id: rid,
        user_id: memberId,
        role: "member" as GroupRoomRole,
        left_at: null,
      }))
    );
    if (insertError) {
      // Concurrent invite: unique conflict → treat as reactivation/idempotent.
      const msg = String(insertError.message ?? "");
      if (/duplicate|unique/i.test(msg)) {
        const { error: retryError } = await (sb as any)
          .from("community_messenger_participants")
          .update({ left_at: null, role: "member" })
          .eq("room_id", rid)
          .in("user_id", toInsert)
          .not("left_at", "is", null);
        if (retryError) {
          return { ok: false, error: String(retryError.message ?? "invite_failed") };
        }
      } else {
        return { ok: false, error: String(insertError.message ?? "invite_failed") };
      }
    }
  }

  return {
    ok: true,
    newlyInvitedMemberIds: [...toReactivate, ...toInsert],
    alreadyActiveMemberIds,
  };
}

export async function countActiveParticipants(sb: GroupRoomSupabase, roomId: string): Promise<number> {
  const rid = trimText(roomId);
  if (!rid) return 0;
  const { data, error } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", rid)
    .is("left_at", null);
  if (error && !isMissingTableError(error)) return 0;
  return Array.isArray(data) ? data.length : 0;
}

export async function profileIdsExist(sb: GroupRoomSupabase, userIds: string[]): Promise<boolean> {
  const ids = dedupeGroupMemberIds(userIds);
  if (!ids.length) return false;
  const { data, error } = await (sb as any).from("profiles").select("id").in("id", ids);
  if (error && !isMissingTableError(error)) return false;
  const found = new Set(((data ?? []) as Array<{ id?: string }>).map((row) => trimText(row.id)).filter(Boolean));
  return ids.every((id) => found.has(id));
}

export async function fetchProfileLabels(
  sb: GroupRoomSupabase,
  userIds: string[]
): Promise<Map<string, string>> {
  const ids = dedupeGroupMemberIds(userIds);
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await (sb as any)
    .from("profiles")
    .select("id, nickname, full_name, display_name")
    .in("id", ids);
  if (error && !isMissingTableError(error)) return out;
  for (const row of (data ?? []) as Array<{
    id?: string;
    nickname?: string | null;
    full_name?: string | null;
    display_name?: string | null;
  }>) {
    const id = trimText(row.id);
    if (!id) continue;
    const label =
      trimText(row.display_name) ||
      trimText(row.nickname) ||
      trimText(row.full_name) ||
      id.slice(0, 6);
    out.set(id, label);
  }
  return out;
}

export async function deletePrivateGroupRoom(sb: GroupRoomSupabase, roomId: string): Promise<void> {
  const rid = trimText(roomId);
  if (!rid) return;
  await (sb as any).from("community_messenger_rooms").delete().eq("id", rid);
}
