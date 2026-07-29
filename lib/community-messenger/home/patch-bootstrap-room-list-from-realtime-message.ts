import {
  bumpRoomTruthVersion,
  versionMsFromIso,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import { setLocalReadGuard } from "@/lib/community-messenger/read/local-read-guard";
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

/** `messenger-realtime-store.normalizeRoomId` 와 동일 — 목록 행 id 와 INSERT `room_id` 대소문자 불일치 방지 */
function normalizeCmListRoomId(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
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
  /** CONTRACT: in-flight dialing/incoming must not tip the home list ahead of CallKit. */
  if (messageType === "call_stub") {
    const meta = row.metadata;
    const callStatus =
      typeof meta === "object" && meta !== null && typeof (meta as { callStatus?: unknown }).callStatus === "string"
        ? String((meta as { callStatus: string }).callStatus).trim().toLowerCase()
        : "";
    if (callStatus === "dialing" || callStatus === "incoming" || callStatus === "ringing") {
      return null;
    }
  }
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
  const target = normalizeCmListRoomId(roomId);
  const idx = rooms.findIndex((r) => normalizeCmListRoomId(String(r.id)) === target);
  if (idx < 0) return rooms;
  const cur = rooms[idx]!;
  const samePreview =
    String(cur.lastMessage ?? "") === String(patch.lastMessage ?? "") &&
    String(cur.lastMessageType ?? "") === String(patch.lastMessageType ?? "") &&
    String(cur.lastMessageAt ?? "") === String(patch.lastMessageAt ?? "");
  if (samePreview) return rooms;
  const updated = { ...cur, ...patch };
  if (String(cur.lastMessageAt ?? "") === String(patch.lastMessageAt ?? "")) {
    const copy = [...rooms];
    copy[idx] = updated;
    return copy;
  }
  const next = [...rooms];
  next[idx] = updated;
  return next.sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
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
  const target = normalizeCmListRoomId(roomId);
  const next = rooms.map((r) => {
    if (normalizeCmListRoomId(String(r.id)) !== target) return r;
    hit = true;
    return { ...r, unreadCount: Math.max(0, (r.unreadCount ?? 0) + 1) };
  });
  return hit ? next : rooms;
}

function findRoomInBootstrapLists(
  data: CommunityMessengerBootstrap,
  roomId: string
): CommunityMessengerRoomSummary | null {
  const target = normalizeCmListRoomId(roomId);
  const hit =
    (data.chats ?? []).find((r) => normalizeCmListRoomId(String(r.id)) === target) ??
    (data.groups ?? []).find((r) => normalizeCmListRoomId(String(r.id)) === target);
  return hit ?? null;
}

function lastEventAtMs(iso: string | null | undefined): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * call_stub terminal preview — room.lastMessageAt(=lastEventAt)이 session.startedAt보다
 * 최신이면 홈 목록 preview를 덮어쓰지 않는다.
 */
export function shouldApplyCallStubListPreviewPatch(
  room: Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageAt" | "lastMessageType">,
  preview: Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageAt" | "lastMessageType">
): boolean {
  const previewAt = trimText(preview.lastMessageAt);
  if (!previewAt) return false;
  const roomAt = trimText(room.lastMessageAt);
  const roomMs = lastEventAtMs(roomAt);
  const previewMs = lastEventAtMs(previewAt);
  if (previewMs <= 0) return false;
  if (roomMs > previewMs) return false;
  if (roomMs === previewMs && room.lastMessageType !== "call_stub") return false;
  return true;
}

/** call_stub terminal preview — lastMessageAt 동일 시 정렬·bump 없이 content만 교체 */
export function patchBootstrapRoomListForCallStubPreviewUpdate(
  data: CommunityMessengerBootstrap,
  roomId: string,
  preview: Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageType" | "lastMessageAt">
): CommunityMessengerBootstrap {
  const rid = String(roomId ?? "").trim();
  if (!rid) return data;
  const existing = findRoomInBootstrapLists(data, rid);
  if (existing && !shouldApplyCallStubListPreviewPatch(existing, preview)) {
    return data;
  }
  const nextChats = patchRoomInList(data.chats ?? [], rid, preview);
  const nextGroups = patchRoomInList(data.groups ?? [], rid, preview);
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  return { ...data, chats: nextChats, groups: nextGroups };
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
    const existing = findRoomInBootstrapLists(data, rid);
    if (
      existing &&
      (String(existing.lastMessage ?? "") !== String(preview.lastMessage ?? "") ||
        String(existing.lastMessageType ?? "") !== String(preview.lastMessageType ?? ""))
    ) {
      return patchBootstrapRoomListForCallStubPreviewUpdate(data, rid, preview);
    }
    return data;
  }
  const boost = Boolean(opts?.boostUnreadCount);
  const nextChats = bumpRoomUnreadIfNeeded(patchRoomInList(data.chats ?? [], rid, preview), rid, boost);
  const nextGroups = bumpRoomUnreadIfNeeded(patchRoomInList(data.groups ?? [], rid, preview), rid, boost);
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  if (mid) lastRealtimeListMessageAppliedByRoomId.set(roomKey, mid);
  const versionMs = versionMsFromIso(preview.lastMessageAt);
  if (versionMs > 0) {
    bumpRoomTruthVersion(rid, versionMs, "realtime_message_insert");
  }
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
    const ridNorm = normalizeCmListRoomId(rid);
    nextChats = pc.map((r) => (normalizeCmListRoomId(String(r.id)) === ridNorm ? { ...r, unreadCount: 0 } : r));
    nextGroups = pg.map((r) => (normalizeCmListRoomId(String(r.id)) === ridNorm ? { ...r, unreadCount: 0 } : r));
  } else {
    let hit = false;
    const ridNorm = normalizeCmListRoomId(rid);
    nextChats = chats0.map((r) => {
      if (normalizeCmListRoomId(String(r.id)) !== ridNorm) return r;
      hit = true;
      return { ...r, unreadCount: 0 };
    });
    nextGroups = groups0.map((r) => {
      if (normalizeCmListRoomId(String(r.id)) !== ridNorm) return r;
      hit = true;
      return { ...r, unreadCount: 0 };
    });
    if (!hit) return data;
  }
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  const refAt = preview?.lastMessageAt?.trim() ?? "";
  setLocalReadGuard({
    roomId: rid,
    referenceLastMessageAt: refAt,
    source: "room_enter",
  });
  const versionMs = versionMsFromIso(refAt);
  if (versionMs > 0) {
    bumpRoomTruthVersion(rid, versionMs, "sender_local_echo");
  }
  return { ...data, chats: nextChats, groups: nextGroups };
}
