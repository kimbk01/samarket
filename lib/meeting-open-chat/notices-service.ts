import type { SupabaseClient } from "@supabase/supabase-js";
import { meetingOpenChatRoleCanManage } from "./permissions";
import type { MeetingOpenChatMemberRole, MeetingOpenChatNoticePublic } from "./types";

function isMissingSchema(message: string): boolean {
  return /42P01|meeting_open_chat_notices|does not exist/i.test(message);
}

function rowToPublic(r: Record<string, unknown>): MeetingOpenChatNoticePublic {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    content: String(r.content ?? ""),
    isPinned: Boolean(r.is_pinned),
    createdAt: String(r.created_at ?? ""),
  };
}

export async function listMeetingOpenChatNotices(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | { ok: true; notices: MeetingOpenChatNoticePublic[] }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("meeting_open_chat_notices")
    .select("id, title, content, is_pinned, created_at")
    .eq("room_id", roomId.trim())
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }
  const notices = (data ?? []).map((x) => rowToPublic(x as Record<string, unknown>));
  return { ok: true, notices };
}

export async function createMeetingOpenChatNotice(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    createdByUserId: string;
    title: string;
    content: string;
    isPinned: boolean;
  }
): Promise<{ ok: true; notice: MeetingOpenChatNoticePublic } | { ok: false; error: string; status: number }> {
  const title = input.title.trim().slice(0, 200);
  const content = input.content.trim().slice(0, 4000);
  if (!content) return { ok: false, error: "content_required", status: 400 };

  const { data, error } = await sb
    .from("meeting_open_chat_notices")
    .insert({
      room_id: input.roomId.trim(),
      title,
      content,
      is_pinned: input.isPinned,
      created_by: input.createdByUserId.trim(),
    })
    .select("id, title, content, is_pinned, created_at")
    .single();

  if (error || !data) {
    if (error && isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error?.message ?? "insert_failed", status: 500 };
  }

  await sb.from("meeting_open_chat_logs").insert({
    room_id: input.roomId.trim(),
    actor_user_id: input.createdByUserId.trim(),
    action_type: "notice_created",
    action_detail: { title },
  });

  return { ok: true, notice: rowToPublic(data as Record<string, unknown>) };
}

export async function patchMeetingOpenChatNotice(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    noticeId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
    title?: string;
    content?: string;
    isPinned?: boolean;
  }
): Promise<{ ok: true; notice: MeetingOpenChatNoticePublic } | { ok: false; error: string; status: number }> {
  if (!meetingOpenChatRoleCanManage(input.actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = input.roomId.trim();
  const nid = input.noticeId.trim();
  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim().slice(0, 200);
  if (input.content !== undefined) {
    const c = input.content.trim().slice(0, 4000);
    if (!c) return { ok: false, error: "content_required", status: 400 };
    updates.content = c;
  }
  if (input.isPinned !== undefined) updates.is_pinned = input.isPinned;
  if (Object.keys(updates).length === 0) {
    const { data: cur } = await sb
      .from("meeting_open_chat_notices")
      .select("id, title, content, is_pinned, created_at")
      .eq("id", nid)
      .eq("room_id", rid)
      .maybeSingle();
    if (!cur) return { ok: false, error: "not_found", status: 404 };
    return { ok: true, notice: rowToPublic(cur as Record<string, unknown>) };
  }

  const { data, error } = await sb
    .from("meeting_open_chat_notices")
    .update(updates)
    .eq("id", nid)
    .eq("room_id", rid)
    .select("id, title, content, is_pinned, created_at")
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }
  if (!data) return { ok: false, error: "not_found", status: 404 };

  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.actorUserId.trim(),
    action_type: "notice_updated",
    action_detail: { notice_id: nid },
  });

  return { ok: true, notice: rowToPublic(data as Record<string, unknown>) };
}

export async function deleteMeetingOpenChatNotice(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    noticeId: string;
    actorUserId: string;
    actorRole: MeetingOpenChatMemberRole;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!meetingOpenChatRoleCanManage(input.actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = input.roomId.trim();
  const nid = input.noticeId.trim();
  const { data: del, error } = await sb
    .from("meeting_open_chat_notices")
    .delete()
    .eq("id", nid)
    .eq("room_id", rid)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, error: "schema_missing", status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }
  if (!del) return { ok: false, error: "not_found", status: 404 };

  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: input.actorUserId.trim(),
    action_type: "notice_deleted",
    action_detail: { notice_id: nid },
  });

  return { ok: true };
}
