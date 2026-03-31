import type { SupabaseClient } from "@supabase/supabase-js";
import { meetingOpenChatRoleCanManage } from "./permissions";
import type {
  MeetingOpenChatAttachmentPublic,
  MeetingOpenChatMemberRole,
  MeetingOpenChatMessagePublic,
  MeetingOpenChatMessageType,
} from "./types";

function isMissingMeetingOpenChatSchemaError(message: string): boolean {
  return /42P01|meeting_open_chat_messages|does not exist/i.test(message);
}

const BLIND_PLACEHOLDER = "운영자에 의해 블라인드 처리된 메시지입니다.";

/** 업로드 API가 쓰는 post-images 경로만 허용(다른 사용자·방 URL 거부) */
export function isAllowedMeetingOpenChatImageUrl(
  imageUrl: string,
  userId: string,
  roomId: string
): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  if (!base) return false;
  try {
    const u = new URL(imageUrl.trim());
    const b = new URL(base);
    if (u.origin !== b.origin) return false;
    const uid = userId.trim();
    const rid = roomId.trim();
    if (!uid || !rid) return false;
    const needle = `/post-images/${uid}/meeting-open-chat/${rid}/`;
    return u.pathname.includes(needle);
  } catch {
    return false;
  }
}

async function patchRoomLastMessage(sb: SupabaseClient<any>, roomId: string, preview: string) {
  const now = new Date().toISOString();
  await sb
    .from("meeting_open_chat_rooms")
    .update({
      last_message_preview: preview.slice(0, 200),
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", roomId.trim());
}

export async function insertMeetingOpenChatSystemMessage(
  sb: SupabaseClient<any>,
  input: { roomId: string; content: string }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = new Date().toISOString();
  const content = input.content.trim().slice(0, 2000);
  if (!content) return { ok: false, error: "content_required", status: 400 };

  const { error } = await sb.from("meeting_open_chat_messages").insert({
    room_id: input.roomId.trim(),
    user_id: null,
    member_id: null,
    message_type: "system" as MeetingOpenChatMessageType,
    content,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  await patchRoomLastMessage(sb, input.roomId, content);
  return { ok: true };
}

function mapAttachmentRow(row: Record<string, unknown>): MeetingOpenChatAttachmentPublic {
  return {
    id: String(row.id),
    fileType: row.file_type as MeetingOpenChatAttachmentPublic["fileType"],
    fileUrl: String(row.file_url ?? ""),
    fileName: (row.file_name as string | null) ?? null,
    fileSize: row.file_size != null ? Number(row.file_size) : null,
  };
}

function mapRowToPublic(
  row: Record<string, unknown>,
  nickByMemberId: Map<string, string>,
  viewerRole: MeetingOpenChatMemberRole,
  attachmentsByMessageId: Map<string, MeetingOpenChatAttachmentPublic[]>
): MeetingOpenChatMessagePublic {
  const memberId = row.member_id as string | null;
  const sender_open_nickname =
    row.message_type === "system"
      ? null
      : memberId
        ? nickByMemberId.get(memberId) ?? null
        : null;

  let content = String(row.content ?? "");
  const is_blinded = Boolean(row.is_blinded);
  const msgId = String(row.id);
  let attachments = attachmentsByMessageId.get(msgId) ?? [];
  if (is_blinded && !meetingOpenChatRoleCanManage(viewerRole)) {
    content = BLIND_PLACEHOLDER;
    attachments = [];
  }

  return {
    id: msgId,
    room_id: String(row.room_id),
    user_id: (row.user_id as string | null) ?? null,
    member_id: memberId,
    message_type: row.message_type as MeetingOpenChatMessagePublic["message_type"],
    content,
    reply_to_message_id: (row.reply_to_message_id as string | null) ?? null,
    is_blinded,
    blinded_reason: (row.blinded_reason as string | null) ?? null,
    blinded_by: (row.blinded_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: (row.deleted_at as string | null) ?? null,
    sender_open_nickname,
    attachments,
  };
}

export async function listMeetingOpenChatMessages(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    viewerRole: MeetingOpenChatMemberRole;
    limit?: number;
    before?: string | null;
    /** 본문 부분 일치(대소문자 무시). % _ 는 입력에서 제거 */
    search?: string | null;
  }
): Promise<
  | { ok: true; messages: MeetingOpenChatMessagePublic[] }
  | { ok: false; error: string; status: number }
> {
  const searchRaw = input.search?.trim().slice(0, 80) ?? "";
  const searchSafe = searchRaw.replace(/[%_\\]/g, "");
  const limit = Math.min(Math.max(Number(input.limit ?? (searchSafe ? 60 : 50)), 1), 100);
  let q = sb
    .from("meeting_open_chat_messages")
    .select(
      "id, room_id, user_id, member_id, message_type, content, reply_to_message_id, is_blinded, blinded_reason, blinded_by, created_at, updated_at, deleted_at"
    )
    .eq("room_id", input.roomId.trim())
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (searchSafe.length > 0) {
    q = q.ilike("content", `%${searchSafe}%`);
  }

  if (input.before) {
    q = q.lt("created_at", input.before);
  }

  const { data, error } = await q;
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const messageIds = rows.map((r) => String(r.id));
  const attachmentsByMessageId = new Map<string, MeetingOpenChatAttachmentPublic[]>();
  if (messageIds.length > 0) {
    const { data: attRows, error: attErr } = await sb
      .from("meeting_open_chat_attachments")
      .select("id, message_id, file_type, file_url, file_name, file_size, sort_order")
      .in("message_id", messageIds)
      .order("sort_order", { ascending: true });
    if (!attErr && attRows) {
      for (const ar of attRows as Record<string, unknown>[]) {
        const mid = String(ar.message_id ?? "");
        if (!mid) continue;
        const list = attachmentsByMessageId.get(mid) ?? [];
        list.push(mapAttachmentRow(ar));
        attachmentsByMessageId.set(mid, list);
      }
    }
  }

  const memberIds = [...new Set(rows.map((r) => r.member_id).filter(Boolean) as string[])];
  const nickByMemberId = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: mems, error: mErr } = await sb
      .from("meeting_open_chat_members")
      .select("id, open_nickname")
      .in("id", memberIds);
    if (!mErr && mems) {
      for (const m of mems as { id: string; open_nickname: string }[]) {
        nickByMemberId.set(m.id, String(m.open_nickname ?? "").trim() || "member");
      }
    }
  }

  const messages = rows.map((r) => mapRowToPublic(r, nickByMemberId, input.viewerRole, attachmentsByMessageId));
  messages.reverse();
  return { ok: true, messages };
}

export async function postMeetingOpenChatTextMessage(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    userId: string;
    memberId: string;
    memberRole: MeetingOpenChatMemberRole;
    body: string;
    replyToMessageId?: string | null;
    /** 방 전용 업로드 경로의 공개 URL만 허용 */
    image?: { url: string; fileName?: string; fileSize?: number } | null;
  }
): Promise<
  | { ok: true; message: MeetingOpenChatMessagePublic }
  | { ok: false; error: string; status: number }
> {
  const image = input.image?.url?.trim()
    ? {
        url: input.image.url.trim(),
        fileName: input.image.fileName?.trim().slice(0, 255),
        fileSize:
          typeof input.image.fileSize === "number" && Number.isFinite(input.image.fileSize)
            ? Math.min(Math.max(0, Math.floor(input.image.fileSize)), 50 * 1024 * 1024)
            : undefined,
      }
    : null;

  if (image && !isAllowedMeetingOpenChatImageUrl(image.url, input.userId, input.roomId)) {
    return { ok: false, error: "invalid_image_url", status: 400 };
  }

  const caption = input.body.trim().slice(0, 2000);
  if (!image && !caption) return { ok: false, error: "body_required", status: 400 };

  const body = image ? caption : input.body.trim().slice(0, 8000);
  if (!image && !body) return { ok: false, error: "body_required", status: 400 };

  const { data: mem, error: memErr } = await sb
    .from("meeting_open_chat_members")
    .select("id, status, muted_until, open_nickname")
    .eq("id", input.memberId)
    .eq("room_id", input.roomId.trim())
    .eq("user_id", input.userId.trim())
    .maybeSingle();

  if (memErr || !mem) {
    if (memErr && isMissingMeetingOpenChatSchemaError(memErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: "not_a_member", status: 403 };
  }
  const mrow = mem as { status: string; muted_until: string | null; open_nickname: string };
  if (mrow.status !== "active") {
    return { ok: false, error: "not_a_member", status: 403 };
  }
  if (mrow.muted_until && new Date(mrow.muted_until).getTime() > Date.now()) {
    return { ok: false, error: "muted", status: 403 };
  }

  const replyTo = input.replyToMessageId?.trim() || null;
  if (replyTo) {
    const { data: rep } = await sb
      .from("meeting_open_chat_messages")
      .select("id")
      .eq("id", replyTo)
      .eq("room_id", input.roomId.trim())
      .maybeSingle();
    if (!rep) return { ok: false, error: "reply_not_found", status: 400 };
  }

  const now = new Date().toISOString();
  const messageType: MeetingOpenChatMessageType = image ? "image" : "text";
  const { data: inserted, error: insErr } = await sb
    .from("meeting_open_chat_messages")
    .insert({
      room_id: input.roomId.trim(),
      user_id: input.userId.trim(),
      member_id: input.memberId,
      message_type: messageType,
      content: body,
      reply_to_message_id: replyTo,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id, room_id, user_id, member_id, message_type, content, reply_to_message_id, is_blinded, blinded_reason, blinded_by, created_at, updated_at, deleted_at"
    )
    .single();

  if (insErr || !inserted) {
    if (insErr && isMissingMeetingOpenChatSchemaError(insErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: insErr?.message ?? "insert_failed", status: 500 };
  }

  const insertedId = String((inserted as Record<string, unknown>).id);

  if (image) {
    const { error: attErr } = await sb.from("meeting_open_chat_attachments").insert({
      message_id: insertedId,
      file_type: "image",
      file_url: image.url,
      file_name: image.fileName ?? null,
      file_size: image.fileSize ?? null,
      sort_order: 0,
      created_at: now,
    });
    if (attErr) {
      await sb.from("meeting_open_chat_messages").delete().eq("id", insertedId);
      if (isMissingMeetingOpenChatSchemaError(attErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: attErr.message, status: 500 };
    }
  }

  await sb
    .from("meeting_open_chat_members")
    .update({ last_seen_at: now, updated_at: now })
    .eq("id", input.memberId);

  const preview = messageType === "image" ? (caption ? `[사진] ${caption}` : "[사진]") : body;
  await patchRoomLastMessage(sb, input.roomId, preview);

  const nickByMemberId = new Map<string, string>([[input.memberId, mrow.open_nickname]]);
  const attMap = new Map<string, MeetingOpenChatAttachmentPublic[]>();
  if (image) {
    const { data: attOne } = await sb
      .from("meeting_open_chat_attachments")
      .select("id, message_id, file_type, file_url, file_name, file_size, sort_order")
      .eq("message_id", insertedId)
      .order("sort_order", { ascending: true });
    if (attOne?.length) {
      attMap.set(
        insertedId,
        (attOne as Record<string, unknown>[]).map((r) => mapAttachmentRow(r))
      );
    }
  }
  const message = mapRowToPublic(
    inserted as Record<string, unknown>,
    nickByMemberId,
    input.memberRole,
    attMap
  );
  return { ok: true, message };
}
