import type {
  CommunityMessengerBootstrap,
  CommunityMessengerMessageType,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

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
export function patchBootstrapRoomListForRealtimeMessageInsert(
  data: CommunityMessengerBootstrap,
  roomId: string,
  messageRow: Record<string, unknown>
): CommunityMessengerBootstrap {
  const rid = String(roomId ?? "").trim();
  if (!rid) return data;
  const preview = listPreviewFromMessengerMessageRow(messageRow);
  if (!preview) return data;
  const nextChats = patchRoomInList(data.chats ?? [], rid, preview);
  const nextGroups = patchRoomInList(data.groups ?? [], rid, preview);
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  return {
    ...data,
    chats: nextChats,
    groups: nextGroups,
  };
}
