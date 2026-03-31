import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeIncomingImageUrlList } from "@/lib/chats/chat-image-bundle";
import { communityChatRoleCanManage, type CommunityChatMemberAccess } from "./room-access";
import type { CommunityChatMessageType } from "./types";

function isMissingCommunityChatSchemaError(message: string): boolean {
  return /42P01|community_chat_rooms|does not exist/i.test(message);
}

const MSG_SELECT =
  "id, room_id, sender_user_id, message_type, body, reply_to_message_id, related_notice_id, metadata, is_blinded, blind_reason, created_at, deleted_at, deleted_by_sender_at";

function allowedClientMessageType(t: string): t is CommunityChatMessageType {
  return t === "text" || t === "image" || t === "file" || t === "reply";
}

export async function listCommunityChatMessages(
  sb: SupabaseClient<any>,
  roomId: string,
  viewerUserId: string,
  viewerMember: CommunityChatMemberAccess,
  opts: { before?: string | null; limit?: number }
): Promise<
  | { ok: true; messages: Record<string, unknown>[] }
  | { ok: false; error: string; status: number }
> {
  const rid = roomId.trim();
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const canManage = communityChatRoleCanManage(viewerMember.role);

  let q = sb
    .from("community_chat_messages")
    .select(MSG_SELECT)
    .eq("room_id", rid)
    .order("created_at", { ascending: false })
    .limit(limit);

  const before = opts.before?.trim();
  if (before) {
    const { data: beforeRow } = await sb
      .from("community_chat_messages")
      .select("created_at")
      .eq("id", before)
      .eq("room_id", rid)
      .maybeSingle();
    const ct = (beforeRow as { created_at?: string } | null)?.created_at;
    if (typeof ct === "string") q = q.lt("created_at", ct);
  }

  const { data: rows, error } = await q;
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const list = ((rows ?? []) as Record<string, unknown>[])
    .filter((m) => {
      if (m.deleted_at != null) return false;
      if (m.deleted_by_sender_at != null) return false;
      if (m.is_blinded === true) {
        const sid = m.sender_user_id;
        if (canManage) return true;
        if (typeof sid === "string" && sid === viewerUserId) return true;
        return false;
      }
      return true;
    })
    .reverse();

  const ids = list.map((m) => String(m.id ?? "")).filter(Boolean);
  if (ids.length > 0) {
    const { data: atts } = await sb
      .from("community_chat_message_attachments")
      .select("id, message_id, kind, storage_bucket, storage_path, original_filename, mime_type, byte_size, sort_order")
      .in("message_id", ids)
      .order("sort_order", { ascending: true });
    const byMsg = new Map<string, Record<string, unknown>[]>();
    for (const a of (atts ?? []) as Record<string, unknown>[]) {
      const mid = String(a.message_id ?? "");
      if (!mid) continue;
      const arr = byMsg.get(mid) ?? [];
      arr.push(a);
      byMsg.set(mid, arr);
    }
    for (const m of list) {
      const mid = String(m.id ?? "");
      m.attachments = byMsg.get(mid) ?? [];
    }
  }

  return { ok: true, messages: list };
}

export type PostCommunityChatMessageInput = {
  roomId: string;
  senderUserId: string;
  senderMember: CommunityChatMemberAccess;
  body: string;
  messageType: CommunityChatMessageType;
  replyToMessageId?: string | null;
  imageUrl?: string | null;
  imageUrls?: unknown;
  /** 파일: 업로드 후 스토리지 경로 */
  attachments?: Array<{
    kind: "image" | "file";
    storage_path: string;
    original_filename?: string | null;
    mime_type?: string | null;
    byte_size?: number | null;
  }>;
};

export async function postCommunityChatMessage(
  sb: SupabaseClient<any>,
  input: PostCommunityChatMessageInput
): Promise<
  | { ok: true; message: { id: string; created_at: string } }
  | { ok: false; error: string; status: number }
> {
  const rid = input.roomId.trim();

  const { data: roomRow } = await sb.from("community_chat_rooms").select("status").eq("id", rid).maybeSingle();
  const st = String((roomRow as { status?: string } | null)?.status ?? "");
  if (st !== "active") {
    return { ok: false, error: "room_not_active", status: 403 };
  }

  let mt = input.messageType;
  if (!allowedClientMessageType(mt)) {
    return { ok: false, error: "message_type_invalid", status: 400 };
  }

  const text = typeof input.body === "string" ? input.body.trim() : "";
  const imageList = normalizeIncomingImageUrlList({
    imageUrl: input.imageUrl,
    imageUrls: input.imageUrls,
  });

  if (mt === "image") {
    if (imageList.length === 0) {
      return { ok: false, error: "image_required", status: 400 };
    }
  } else if (mt === "file") {
    const atts = input.attachments?.filter((a) => a.kind === "file" && a.storage_path?.trim()) ?? [];
    if (atts.length === 0) {
      return { ok: false, error: "file_attachment_required", status: 400 };
    }
  } else if (mt === "reply" || mt === "text") {
    if (!text && mt === "text") {
      return { ok: false, error: "body_required", status: 400 };
    }
  }

  const replyId = input.replyToMessageId?.trim() || null;
  if (mt === "reply" && !replyId) {
    return { ok: false, error: "reply_target_required", status: 400 };
  }
  if (replyId) {
    const { data: parent } = await sb
      .from("community_chat_messages")
      .select("id")
      .eq("id", replyId)
      .eq("room_id", rid)
      .maybeSingle();
    if (!parent?.id) {
      return { ok: false, error: "reply_target_not_found", status: 400 };
    }
    if (mt === "text") mt = "reply";
  }

  const metadata: Record<string, unknown> = {
    senderNickname: input.senderMember.nickname,
  };
  if (imageList.length > 0) {
    metadata.imageUrls = imageList;
    if (imageList.length === 1) metadata.imageUrl = imageList[0];
  }

  let bodyOut = text;
  if (mt === "image") {
    bodyOut =
      text ||
      (imageList.length > 1 ? `사진 ${imageList.length}장` : "사진");
  } else if (mt === "file") {
    bodyOut = text || "파일";
  }

  const { data: inserted, error: insErr } = await sb
    .from("community_chat_messages")
    .insert({
      room_id: rid,
      sender_user_id: input.senderUserId,
      message_type: mt,
      body: bodyOut.slice(0, 8000),
      reply_to_message_id: replyId,
      metadata,
    })
    .select("id, created_at")
    .single();

  if (insErr || !inserted) {
    if (insErr && isMissingCommunityChatSchemaError(insErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: insErr?.message ?? "insert_failed", status: 500 };
  }

  const msgId = String((inserted as { id: string }).id);
  const createdAt = String((inserted as { created_at: string }).created_at);

  const fileAtts = input.attachments?.filter((a) => a.storage_path?.trim()) ?? [];
  if (fileAtts.length > 0) {
    const rows = fileAtts.map((a, i) => ({
      message_id: msgId,
      kind: a.kind,
      storage_path: a.storage_path.trim(),
      original_filename: a.original_filename?.trim() || null,
      mime_type: a.mime_type?.trim() || null,
      byte_size: a.byte_size != null ? Math.round(Number(a.byte_size)) : null,
      sort_order: i,
    }));
    const { error: attErr } = await sb.from("community_chat_message_attachments").insert(rows);
    if (attErr) {
      await sb.from("community_chat_messages").delete().eq("id", msgId);
      return { ok: false, error: attErr.message, status: 500 };
    }
  }

  await sb
    .from("community_chat_rooms")
    .update({ updated_at: createdAt })
    .eq("id", rid);

  return { ok: true, message: { id: msgId, created_at: createdAt } };
}

export async function markCommunityChatRoomRead(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string,
  messageId?: string | null
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const rid = roomId.trim();
  const uid = userId.trim();
  const now = new Date().toISOString();

  let lastId = messageId?.trim() || null;
  if (!lastId) {
    const { data: lastMsg } = await sb
      .from("community_chat_messages")
      .select("id")
      .eq("room_id", rid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastId = lastMsg ? String((lastMsg as { id: string }).id) : null;
  } else {
    const { data: check } = await sb
      .from("community_chat_messages")
      .select("id")
      .eq("id", lastId)
      .eq("room_id", rid)
      .maybeSingle();
    if (!check) {
      return { ok: false, error: "message_not_found", status: 400 };
    }
  }

  const { error } = await sb
    .from("community_chat_room_members")
    .update({
      last_read_message_id: lastId,
      last_read_at: now,
      updated_at: now,
    })
    .eq("room_id", rid)
    .eq("user_id", uid)
    .eq("member_status", "joined");

  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true };
}
