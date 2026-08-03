import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMemberAdminNoteNotificationPayload } from "@/lib/notifications/member-admin-notes";
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

async function notifyMemberOfAdminNote(
  sb: SupabaseClient,
  input: {
    memberUserId: string;
    threadId: string;
    subject: string;
    body: string;
    adminUserId: string;
  }
): Promise<void> {
  const displayPayload = buildMemberAdminNoteNotificationPayload({
    threadId: input.threadId,
    subject: input.subject,
    bodyPreview: input.body,
  });
  const dedupeKey = `member_admin_note:${input.threadId}:${Date.now()}`;
  /** Canonical A write + push (absolute badge echo via notify-push-dispatcher). */
  await createAndDispatchNotificationEvent(sb, {
    userId: input.memberUserId,
    type: "admin_notice",
    category: "admin_notice",
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
  memberUserId: string
): Promise<{ ok: true; threads: NoteThreadRow[] } | { ok: false; error: string; empty?: boolean }> {
  const { data, error } = await sb
    .from("member_admin_note_threads")
    .select("*")
    .eq("member_user_id", memberUserId)
    .order("last_message_at", { ascending: false })
    .limit(50);
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
