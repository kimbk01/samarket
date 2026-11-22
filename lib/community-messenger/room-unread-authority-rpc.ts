/**
 * Room Unread Authority v1 — product invoke helpers (service_role).
 * store_order: use via readOrderChat.
 * general_direct / group / trade: prefer markRoomReadAtomic over legacy open_tail.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC,
  DIBAY_MARK_ROOM_READ_ATOMIC_RPC,
  type RoomUnreadViewerRole,
} from "@/lib/community-messenger/contracts/room-unread-authority";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type MarkRoomReadAtomicResult =
  | {
      ok: true;
      lastReadMessageId: string | null;
      lastReadAt: string | null;
      unreadCount: number;
      duplicateSkipped: boolean;
      lastReadAdvanced: boolean;
      regressionBlocked: boolean;
      /** 같은 idempotency key 재요청 — DB 가 첫 결과를 다시 돌려줌(마이그레이션 20271119220000 이후 표시) */
      replayed?: boolean;
    }
  | { ok: false; error: string };

/**
 * 읽음 1단계 (docs/audit/supabase-request-surge-2026-11-18/read-mark-legacy-design-2026-11-19.md · Owner 「1단계 승인」 2026-11-19):
 * 원자 읽음이 「바뀐 것 없음」(`duplicateSkipped` — 이미 다 읽은 상태, DB 함수가 커서·안 읽음·알림을 건드리지 않고 돌아옴)이면
 * 허브·홈 목록 사본 재생성과 부트스트랩 무효화 표시를 하지 않는다. 운영 48시간 549건 중 234건(43%)이 이 경우.
 * 레거시(Telegram·카카오톡)도 이미 읽은 방의 읽음에는 아무 후속 작업을 하지 않는다.
 * 보완(Owner 「보완 진행」 2026-11-19): 같은 방·같은 끝 메시지 재요청은 DB 가 첫 결과를 그대로 돌려줘(`replayed: true`)
 * 이전 처리와 같은 상태 — 역시 바뀐 것 없음.
 */
export function atomicReadChangedState(result: Extract<MarkRoomReadAtomicResult, { ok: true }>): boolean {
  return !result.duplicateSkipped && result.replayed !== true;
}

export async function markRoomReadAtomic(
  sb: SupabaseClient<any>,
  input: {
    viewerId: string;
    roomId: string;
    chatDomain: ChatDomain;
    domainIdentityKey: string;
    viewerRole: RoomUnreadViewerRole;
    storeId?: string | null;
    orderId?: string | null;
    readThroughMessageId?: string | null;
    idempotencyKey: string;
  }
): Promise<MarkRoomReadAtomicResult> {
  const { data, error } = await (sb as any).rpc(DIBAY_MARK_ROOM_READ_ATOMIC_RPC, {
    p_viewer_id: input.viewerId,
    p_room_id: input.roomId,
    p_chat_domain: input.chatDomain,
    p_domain_identity_key: input.domainIdentityKey,
    p_viewer_role: input.viewerRole,
    p_store_id: input.storeId ?? null,
    p_order_id: input.orderId ?? null,
    p_read_through_message_id: input.readThroughMessageId ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { ok: false, error: String(error.message ?? "mark_room_read_failed") };
  return mapMarkRoomReadAtomicPayload(data);
}

function mapMarkRoomReadAtomicPayload(data: unknown): MarkRoomReadAtomicResult {
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: String(payload?.error ?? "mark_room_read_denied") };
  }
  return {
    ok: true,
    lastReadMessageId: trim(payload.lastReadMessageId) || null,
    lastReadAt: trim(payload.lastReadAt) || null,
    unreadCount: Math.max(0, Math.floor(Number(payload.unreadCount) || 0)),
    duplicateSkipped: payload.duplicateSkipped === true,
    replayed: payload.replayed === true,
    lastReadAdvanced: payload.lastReadAdvanced === true,
    regressionBlocked: payload.regressionBlocked === true,
  };
}

export const DIBAY_MARK_ROOM_READ_ATOMIC_AUTO_RPC = "dibay_mark_room_read_atomic_auto";

/**
 * 2026-11-22 읽음 2단계 — 방 종류·식별 키·끝 메시지·중복 방지 키를 DB 함수 안에서 정하고 기존 원자 읽음을 부른다.
 * (이전: 방 조회 1 + 끝 메시지 조회 1 + 원자 읽음 1.) 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage2-design-2026-11-22.md
 * - `unsupported`: 일반 1:1·그룹·거래가 아님·식별 키 없음·방 없음 → 아무것도 안 씀(이전 경로로)
 * - `missing`: DB 함수 적용 전 → 지금 3번 경로로
 */
export async function markRoomReadAtomicAuto(
  sb: SupabaseClient<any>,
  input: { viewerId: string; roomId: string; readThroughMessageId: string | null }
): Promise<
  | { kind: "done"; result: MarkRoomReadAtomicResult }
  | { kind: "unsupported" }
  | { kind: "missing" }
> {
  const { data, error } = await (sb as any).rpc(DIBAY_MARK_ROOM_READ_ATOMIC_AUTO_RPC, {
    p_viewer_id: input.viewerId,
    p_room_id: input.roomId,
    p_read_through_message_id: input.readThroughMessageId ?? null,
  });
  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "PGRST202" || code === "42883" || msg.includes("could not find the function") || (msg.includes(DIBAY_MARK_ROOM_READ_ATOMIC_AUTO_RPC) && msg.includes("does not exist"))) {
      return { kind: "missing" };
    }
    return { kind: "done", result: { ok: false, error: String(error.message ?? "mark_room_read_failed") } };
  }
  const payload = data as Record<string, unknown> | null;
  if (payload && payload.ok !== true && payload.error === "unsupported_domain") return { kind: "unsupported" };
  return { kind: "done", result: mapMarkRoomReadAtomicPayload(data) };
}

export async function loadRoomDomainForUnreadAuthority(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ chatDomain: ChatDomain; domainIdentityKey: string } | null> {
  const { data, error } = await sb
    .from("community_messenger_rooms")
    .select("chat_domain, domain_identity_key")
    .eq("id", roomId)
    .maybeSingle();
  if (error || !data) return null;
  const chatDomain = trim((data as { chat_domain?: unknown }).chat_domain) as ChatDomain;
  const domainIdentityKey = trim((data as { domain_identity_key?: unknown }).domain_identity_key);
  if (
    chatDomain !== "general_direct" &&
    chatDomain !== "group" &&
    chatDomain !== "trade" &&
    chatDomain !== "store_order"
  ) {
    return null;
  }
  if (!domainIdentityKey) return null;
  return { chatDomain, domainIdentityKey };
}

/**
 * CONTRACT: open / open_tail mark-read idempotency must include current tip.
 * Fixed keys (`…:open`, `…:open_tail`) return a prior `{ok, unreadCount:0}` forever
 * after the first clean mark, so later messages never advance the cursor.
 * Matches `dibay_mark_room_read_atomic` tip ORDER BY created_at DESC, id DESC.
 */
export async function resolveRoomReadableTipMessageId(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<string> {
  const rid = trim(roomId);
  if (!rid) return "empty";
  const { data, error } = await sb
    .from("community_messenger_messages")
    .select("id")
    .eq("room_id", rid)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return "empty";
  return trim((data as { id?: unknown } | null)?.id) || "empty";
}

/** CM GD/Group/Trade — tip-scoped when open_tail (no explicit through id). */
export function buildCmMarkReadIdempotencyKey(input: {
  userId: string;
  roomId: string;
  openTail: boolean;
  requestedLastReadMessageId: string;
  tipMessageId: string;
}): string {
  const segment = input.openTail
    ? `open:${trim(input.tipMessageId) || "empty"}`
    : trim(input.requestedLastReadMessageId) || "none";
  return ["cm_mark_read", trim(input.userId), trim(input.roomId), segment].join(":");
}

/** Store-order — tip-scoped when open_tail (no explicit through id). */
export function buildSoMarkReadIdempotencyKey(input: {
  userId: string;
  roomId: string;
  role: string;
  throughMessageId: string | null;
  tipMessageId: string;
}): string {
  const through = trim(input.throughMessageId ?? "");
  const segment = through
    ? through
    : `open_tail:${trim(input.tipMessageId) || "empty"}`;
  return [
    "so_mark_read",
    trim(input.userId),
    trim(input.roomId),
    trim(input.role),
    segment,
  ].join(":");
}

export async function appendRoomMessageAtomic(
  sb: SupabaseClient<any>,
  input: {
    idempotencyKey: string;
    roomId: string;
    chatDomain: string;
    domainIdentityKey: string;
    senderId: string;
    senderRole?: string;
    messageType: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    countsAsUnread?: boolean;
    clientMessageId?: string | null;
    /** store_order system: insert sender_id NULL while actor drives unread */
    forceNullMessageSender?: boolean;
  }
): Promise<
  | { ok: true; message: Record<string, unknown>; recipientUserIds: string[]; deduped: boolean }
  | { ok: false; error: string; rpcMissing?: boolean }
> {
  const args: Record<string, unknown> = {
    p_idempotency_key: input.idempotencyKey,
    p_room_id: input.roomId,
    p_chat_domain: input.chatDomain,
    p_domain_identity_key: input.domainIdentityKey,
    p_sender_id: input.senderId,
    p_sender_role: input.senderRole ?? "member",
    p_message_type: input.messageType,
    p_content: input.content,
    p_metadata: input.metadata ?? {},
    p_created_at: input.createdAt ?? new Date().toISOString(),
    p_counts_as_unread: input.countsAsUnread !== false,
    p_client_message_id: input.clientMessageId ?? null,
  };
  if (input.forceNullMessageSender) {
    args.p_force_null_message_sender = true;
  }
  const { data, error } = await (sb as any).rpc(DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC, args);
  if (error) {
    const msg = String(error.message ?? "append_failed");
    const rpcMissing =
      /does not exist|schema cache|Could not find the function/i.test(msg) ||
      msg.toLowerCase().includes("dibay_append_room_message_atomic");
    return { ok: false, error: msg, rpcMissing };
  }
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: String(payload?.error ?? "append_denied") };
  }
  const recipientsRaw = payload.recipient_user_ids;
  const recipientUserIds = Array.isArray(recipientsRaw)
    ? recipientsRaw.map((x) => String(x)).filter(Boolean)
    : [];
  return {
    ok: true,
    message: (payload.message as Record<string, unknown>) ?? {},
    recipientUserIds,
    deduped: payload.deduped === true,
  };
}

/** Typed CM send via Room Unread Authority — fail-closed (no insert+apply_unread). */
export async function appendTypedMessengerMessageAtomic(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    senderId: string;
    messageType: "sticker" | "voice" | "file" | "image" | "text" | "system" | "call_stub";
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    clientMessageId?: string | null;
    idempotencyKey: string;
    forceNullMessageSender?: boolean;
    countsAsUnread?: boolean;
  }
): Promise<
  | {
      ok: true;
      messageId: string;
      createdAt: string;
      recipientUserIds: string[];
      deduped: boolean;
      rpcUsed: typeof DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC;
      fallbackUsed: false;
    }
  | { ok: false; error: string; fallbackUsed: false }
> {
  const meta = await loadRoomDomainForUnreadAuthority(sb, input.roomId);
  if (!meta) {
    return { ok: false, error: "room_domain_missing", fallbackUsed: false };
  }
  if (input.forceNullMessageSender && input.messageType !== "system") {
    return { ok: false, error: "null_sender_forbidden", fallbackUsed: false };
  }
  const appended = await appendRoomMessageAtomic(sb, {
    idempotencyKey: input.idempotencyKey,
    roomId: input.roomId,
    chatDomain: meta.chatDomain,
    domainIdentityKey: meta.domainIdentityKey,
    senderId: input.senderId,
    messageType: input.messageType,
    content: input.content,
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    countsAsUnread: input.countsAsUnread !== false,
    clientMessageId: input.clientMessageId ?? null,
    forceNullMessageSender: input.forceNullMessageSender === true,
  });
  if (!appended.ok) {
    return { ok: false, error: appended.error, fallbackUsed: false };
  }
  const messageId = String(appended.message.id ?? "").trim();
  const createdAt =
    typeof appended.message.created_at === "string"
      ? appended.message.created_at
      : input.createdAt ?? new Date().toISOString();
  if (!messageId) {
    return { ok: false, error: "append_missing_message_id", fallbackUsed: false };
  }
  return {
    ok: true,
    messageId,
    createdAt,
    recipientUserIds: appended.recipientUserIds,
    deduped: appended.deduped,
    rpcUsed: DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC,
    fallbackUsed: false,
  };
}
