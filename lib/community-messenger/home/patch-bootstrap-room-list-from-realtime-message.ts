import type {
  CommunityMessengerBootstrap,
  CommunityMessengerMessage,
  CommunityMessengerMessageType,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

/** 동일 `INSERT` 이벤트 중복 시 정렬·unread 낙관 bump 방지 */
const lastRealtimeListMessageAppliedByRoomId = new Map<string, string>();

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessageType(raw: string): CommunityMessengerMessageType {
  if (
    raw === "image" ||
    raw === "file" ||
    raw === "system" ||
    raw === "call_stub" ||
    raw === "voice" ||
    raw === "sticker"
  ) {
    return raw;
  }
  return "text";
}

/** 클라 전송 확정 메시지 → `listPreviewFromMessengerMessageRow` 가 기대하는 postgres_changes 형 */
export function messengerClientMessageToInsertRow(msg: CommunityMessengerMessage): Record<string, unknown> {
  const meta = (msg as { metadata?: unknown }).metadata;
  return {
    id: msg.id,
    room_id: msg.roomId,
    sender_id: msg.senderId ?? null,
    message_type: msg.messageType,
    content: msg.content ?? null,
    metadata: meta && typeof meta === "object" ? meta : null,
    created_at: msg.createdAt,
  };
}

/** Realtime `community_messenger_messages` 행 → 목록 카드 프리뷰(서버 summarize 와 유사한 수준). */
export function listPreviewFromMessengerMessageRow(row: Record<string, unknown>): {
  lastMessage: string;
  lastMessageType: CommunityMessengerMessageType;
  lastMessageAt: string;
} | null {
  const content = trimText(row.content);
  const mtRaw = trimText(row.message_type) || "text";
  const messageType = normalizeMessageType(mtRaw);
  const createdAt = trimText(row.created_at);
  if (!createdAt) return null;
  let lastMessage = content;
  if (messageType === "image") lastMessage = lastMessage || "사진";
  if (messageType === "file") {
    const meta = row.metadata;
    const name =
      typeof meta === "object" && meta !== null && typeof (meta as { fileName?: unknown }).fileName === "string"
        ? String((meta as { fileName: string }).fileName).trim()
        : "";
    lastMessage = name || "파일";
  }
  if (messageType === "voice") lastMessage = lastMessage || "음성 메시지";
  if (messageType === "sticker") lastMessage = lastMessage || "스티커";
  if (messageType === "call_stub") lastMessage = lastMessage || "통화";
  if (messageType === "system") lastMessage = lastMessage || "알림";
  if (!lastMessage) lastMessage = "새 메시지";
  return { lastMessage, lastMessageType: messageType, lastMessageAt: createdAt };
}

function patchRoomInList(
  rooms: CommunityMessengerRoomSummary[],
  roomId: string,
  patch: Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageType" | "lastMessageAt">
): CommunityMessengerRoomSummary[] {
  let hit = false;
  const next = rooms.map((r) => {
    if (String(r.id) !== String(roomId)) return r;
    hit = true;
    return { ...r, ...patch };
  });
  if (!hit) return rooms;
  return [...next].sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
}

/**
 * 홈 부트스트랩의 chats/groups 에서 해당 방만 마지막 메시지 프리뷰 갱신 + 최근순 정렬.
 * unread_count 는 participant Realtime·home-sync 가 진실 — 여기서는 건드리지 않는다.
 */
function bumpRoomUnreadIfNeeded(
  rooms: CommunityMessengerRoomSummary[],
  roomId: string,
  boost: boolean
): CommunityMessengerRoomSummary[] {
  if (!boost) return rooms;
  let hit = false;
  const next = rooms.map((r) => {
    if (String(r.id) !== String(roomId)) return r;
    hit = true;
    return { ...r, unreadCount: Math.max(0, (r.unreadCount ?? 0) + 1) };
  });
  return hit ? next : rooms;
}

export function patchBootstrapRoomListForRealtimeMessageInsert(
  data: CommunityMessengerBootstrap,
  roomId: string,
  messageRow: Record<string, unknown>,
  opts?: { boostUnreadCount?: boolean }
): CommunityMessengerBootstrap {
  const rid = String(roomId ?? "").trim();
  if (!rid) return data;
  const preview = listPreviewFromMessengerMessageRow(messageRow);
  if (!preview) return data;
  const mid = typeof messageRow.id === "string" ? messageRow.id.trim() : "";
  const roomKey = rid.toLowerCase();
  if (mid && lastRealtimeListMessageAppliedByRoomId.get(roomKey) === mid) {
    return data;
  }
  const boost = Boolean(opts?.boostUnreadCount);
  const nextChats = bumpRoomUnreadIfNeeded(patchRoomInList(data.chats ?? [], rid, preview), rid, boost);
  const nextGroups = bumpRoomUnreadIfNeeded(patchRoomInList(data.groups ?? [], rid, preview), rid, boost);
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  if (mid) lastRealtimeListMessageAppliedByRoomId.set(roomKey, mid);
  return {
    ...data,
    chats: nextChats,
    groups: nextGroups,
  };
}

/**
 * 발신 직후(다른 탭·홈 목록): 서버 `participants` Realtime 보다 앞서
 * 해당 행의 `unreadCount` 를 0으로 맞추고, 선택적으로 마지막 메시지 프리뷰를 갱신한다.
 */
export function patchBootstrapRoomListForSenderLocalEcho(
  data: CommunityMessengerBootstrap,
  roomId: string,
  preview:
    | Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageType" | "lastMessageAt">
    | null
): CommunityMessengerBootstrap {
  const rid = String(roomId ?? "").trim();
  if (!rid) return data;
  const chats0 = data.chats ?? [];
  const groups0 = data.groups ?? [];
  let nextChats: CommunityMessengerRoomSummary[];
  let nextGroups: CommunityMessengerRoomSummary[];
  if (preview) {
    const pc = patchRoomInList(chats0, rid, preview);
    const pg = patchRoomInList(groups0, rid, preview);
    if (pc === chats0 && pg === groups0) return data;
    nextChats = pc.map((r) => (String(r.id) === rid ? { ...r, unreadCount: 0 } : r));
    nextGroups = pg.map((r) => (String(r.id) === rid ? { ...r, unreadCount: 0 } : r));
  } else {
    let hit = false;
    nextChats = chats0.map((r) => {
      if (String(r.id) !== rid) return r;
      hit = true;
      return { ...r, unreadCount: 0 };
    });
    nextGroups = groups0.map((r) => {
      if (String(r.id) !== rid) return r;
      hit = true;
      return { ...r, unreadCount: 0 };
    });
    if (!hit) return data;
  }
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  return { ...data, chats: nextChats, groups: nextGroups };
}
