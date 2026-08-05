import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMemberAdminNoteNotificationPayload,
  kindFromStartedBy,
  startedByFromKind,
  type MemberAdminNoteKind,
  type MemberAdminNoteStartedBy,
} from "@/lib/notifications/member-admin-notes";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";

export type NoteThreadRow = {
  id: string;
  member_user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  member_unread_count: number;
  admin_unread_count: number;
  created_at: string;
  updated_at: string;
  started_by?: MemberAdminNoteStartedBy | string;
  member_archived_at?: string | null;
};

export type NoteMessageRow = {
  id: string;
  thread_id: string;
  sender_role: "member" | "admin";
  sender_user_id: string | null;
  body: string;
  created_at: string;
};

function isMissingNotesTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("member_admin_note") && m.includes("does not exist");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

async function notifyMemberOfAdminNote(
  sb: SupabaseClient,
  input: {
    memberUserId: string;
    threadId: string;
    subject: string;
    body: string;
    adminUserId: string;
    startedBy?: string | null;
  }
): Promise<void> {
  const startedBy = input.startedBy ?? "member";
  const displayPayload = buildMemberAdminNoteNotificationPayload({
    threadId: input.threadId,
    subject: input.subject,
    bodyPreview: input.body,
    startedBy,
  });
  const dedupeKey = `member_admin_note:${input.threadId}:${Date.now()}`;
  /**
   * Phase 5 Slice 1 taxonomy A:
   * Inquiry (member-started) → inquiry_answered; Inbox (admin-started) → inbox_message_received.
   * Campaign continues to write admin_notice (collision removed for notes writer only).
   */
  const eventType = startedBy === "admin" ? "inbox_message_received" : "inquiry_answered";
  /** Canonical A write + push (absolute badge echo via notify-push-dispatcher). */
  await createAndDispatchNotificationEvent(sb, {
    userId: input.memberUserId,
    type: eventType,
    category: eventType,
    title: input.subject,
    body: input.body.slice(0, 500),
    displayPayload,
    dedupeKey,
    actorUserId: input.adminUserId,
    appState: "background",
  });
}

export async function listMemberNoteThreads(
  sb: SupabaseClient,
  memberUserId: string,
  opts?: { kind?: MemberAdminNoteKind }
): Promise<{ ok: true; threads: NoteThreadRow[] } | { ok: false; error: string; empty?: boolean }> {
  let q = sb
    .from("member_admin_note_threads")
    .select("*")
    .eq("member_user_id", memberUserId)
    .is("member_archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (opts?.kind) {
    q = q.eq("started_by", startedByFromKind(opts.kind));
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingNotesTable(error.message ?? "")) return { ok: true, threads: [] };
    return { ok: false, error: error.message };
  }
  return { ok: true, threads: (data ?? []) as NoteThreadRow[] };
}

export async function listAdminNoteThreads(
  sb: SupabaseClient
): Promise<{ ok: true; threads: NoteThreadRow[] } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("member_admin_note_threads")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingNotesTable(error.message ?? "")) return { ok: true, threads: [] };
    return { ok: false, error: error.message };
  }
  return { ok: true, threads: (data ?? []) as NoteThreadRow[] };
}

export async function getNoteThreadWithMessages(
  sb: SupabaseClient,
  threadId: string
): Promise<
  | { ok: true; thread: NoteThreadRow; messages: NoteMessageRow[] }
  | { ok: false; error: string; notFound?: boolean }
> {
  const { data: thread, error: tErr } = await sb
    .from("member_admin_note_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (tErr) {
    if (isMissingNotesTable(tErr.message ?? "")) return { ok: false, error: "missing_table", notFound: true };
    return { ok: false, error: tErr.message };
  }
  if (!thread) return { ok: false, error: "not_found", notFound: true };
  const { data: messages, error: mErr } = await sb
    .from("member_admin_note_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (mErr) return { ok: false, error: mErr.message };
  return {
    ok: true,
    thread: thread as NoteThreadRow,
    messages: (messages ?? []) as NoteMessageRow[],
  };
}

export async function createMemberNoteThread(
  sb: SupabaseClient,
  input: { memberUserId: string; subject: string; body: string }
): Promise<{ ok: true; thread: NoteThreadRow } | { ok: false; error: string }> {
  const subject = input.subject.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 4000);
  if (!subject || !body) return { ok: false, error: "invalid_input" };
  const now = new Date().toISOString();
  const { data: thread, error } = await sb
    .from("member_admin_note_threads")
    .insert({
      member_user_id: input.memberUserId,
      subject,
      status: "open",
      started_by: "member",
      last_message_at: now,
      member_unread_count: 0,
      admin_unread_count: 1,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) {
    if (isMissingNotesTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: error.message };
  }
  const { error: mErr } = await sb.from("member_admin_note_messages").insert({
    thread_id: thread.id,
    sender_role: "member",
    sender_user_id: input.memberUserId,
    body,
  });
  if (mErr) return { ok: false, error: mErr.message };
  return { ok: true, thread: thread as NoteThreadRow };
}

/** Admin → exactly one member. Product: Inbox (started_by=admin). */
export async function createAdminNoteThread(
  sb: SupabaseClient,
  input: {
    memberUserId: string;
    adminUserId: string;
    subject: string;
    body: string;
  }
): Promise<{ ok: true; thread: NoteThreadRow } | { ok: false; error: string }> {
  const memberUserId = input.memberUserId.trim();
  const subject = input.subject.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 4000);
  if (!isUuid(memberUserId) || !subject || !body) return { ok: false, error: "invalid_input" };
  const now = new Date().toISOString();
  const { data: thread, error } = await sb
    .from("member_admin_note_threads")
    .insert({
      member_user_id: memberUserId,
      subject,
      status: "answered",
      started_by: "admin",
      last_message_at: now,
      member_unread_count: 1,
      admin_unread_count: 0,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) {
    if (isMissingNotesTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: error.message };
  }
  const { error: mErr } = await sb.from("member_admin_note_messages").insert({
    thread_id: thread.id,
    sender_role: "admin",
    sender_user_id: input.adminUserId,
    body,
  });
  if (mErr) return { ok: false, error: mErr.message };

  await notifyMemberOfAdminNote(sb, {
    memberUserId,
    threadId: thread.id,
    subject,
    body,
    adminUserId: input.adminUserId,
    startedBy: "admin",
  });

  return { ok: true, thread: thread as NoteThreadRow };
}

export async function archiveMemberNoteThread(
  sb: SupabaseClient,
  input: { threadId: string; memberUserId: string }
): Promise<{ ok: true } | { ok: false; error: string; notFound?: boolean }> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("member_admin_note_threads")
    .update({ member_archived_at: now, updated_at: now })
    .eq("id", input.threadId)
    .eq("member_user_id", input.memberUserId)
    .is("member_archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingNotesTable(error.message ?? "")) return { ok: false, error: "missing_table", notFound: true };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "not_found", notFound: true };
  return { ok: true };
}

export async function postNoteMessage(
  sb: SupabaseClient,
  input: {
    threadId: string;
    senderRole: "member" | "admin";
    senderUserId: string;
    body: string;
  }
): Promise<{ ok: true; message: NoteMessageRow } | { ok: false; error: string; notFound?: boolean }> {
  const body = input.body.trim().slice(0, 4000);
  if (!body) return { ok: false, error: "invalid_input" };
  const loaded = await getNoteThreadWithMessages(sb, input.threadId);
  if (!loaded.ok) return loaded;
  const thread = loaded.thread;
  if (input.senderRole === "member" && thread.member_user_id !== input.senderUserId) {
    return { ok: false, error: "forbidden" };
  }
  const now = new Date().toISOString();
  const { data: message, error } = await sb
    .from("member_admin_note_messages")
    .insert({
      thread_id: thread.id,
      sender_role: input.senderRole,
      sender_user_id: input.senderUserId,
      body,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  const patch =
    input.senderRole === "member"
      ? {
          last_message_at: now,
          updated_at: now,
          admin_unread_count: thread.admin_unread_count + 1,
          status: "open",
        }
      : {
          last_message_at: now,
          updated_at: now,
          member_unread_count: thread.member_unread_count + 1,
          status: "answered",
        };
  await sb.from("member_admin_note_threads").update(patch).eq("id", thread.id);

  if (input.senderRole === "admin") {
    await notifyMemberOfAdminNote(sb, {
      memberUserId: thread.member_user_id,
      threadId: thread.id,
      subject: thread.subject,
      body,
      adminUserId: input.senderUserId,
      startedBy: thread.started_by ?? "member",
    });
  }

  return { ok: true, message: message as NoteMessageRow };
}

/**
 * Clear Member A Bell rows for this note thread (display_payload.noteThreadId /
 * dedupe prefix). Thread table unread is orthogonal and cleared separately.
 */
export async function markMemberAdminNoteNotificationsRead(
  sb: SupabaseClient,
  input: { threadId: string; memberUserId: string }
): Promise<number> {
  const uid = input.memberUserId.trim();
  const threadId = input.threadId.trim();
  if (!uid || !threadId) return 0;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .like("dedupe_key", `member_admin_note:${threadId}:%`)
    .select("id");
  if (error) {
    console.warn("[markMemberAdminNoteNotificationsRead]", error.message);
    return 0;
  }
  const count = data?.length ?? 0;
  if (count > 0) invalidateNotificationBadgeCache(uid);
  return count;
}

export async function markMemberNoteThreadRead(
  sb: SupabaseClient,
  input: { threadId: string; memberUserId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb
    .from("member_admin_note_threads")
    .update({ member_unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", input.threadId)
    .eq("member_user_id", input.memberUserId);
  if (error) return { ok: false, error: error.message };
  await markMemberAdminNoteNotificationsRead(sb, input);
  return { ok: true };
}

export async function markAdminNoteThreadRead(
  sb: SupabaseClient,
  threadId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb
    .from("member_admin_note_threads")
    .update({ admin_unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { kindFromStartedBy };
