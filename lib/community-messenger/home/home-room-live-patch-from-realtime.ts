/**
 * Home list live tip delta — messages UPDATE / rooms tip UPDATE → applyHomeListPatch 입력 정규화.
 * CONTRACT: silent refresh / full bootstrap 금지. tip 의미 변경만 통과.
 */
import {
  listPreviewFromMessengerMessageRow,
  patchBootstrapRoomListForCallStubPreviewUpdate,
  shouldApplyCallStubListPreviewPatch,
} from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import {
  bumpRoomTruthVersion,
  versionMsFromIso,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerMessageType,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type HomeRoomLiveTipPatchSource = "message_update" | "room_summary_update";

export type HomeRoomLiveTipPatch = {
  source: HomeRoomLiveTipPatchSource;
  roomId: string;
  messageId?: string;
  preview: Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageType" | "lastMessageAt">;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCmListRoomId(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
}

function lastEventAtMs(iso: string | null | undefined): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function findRoomInBootstrapLists(
  data: CommunityMessengerBootstrap,
  roomId: string
): CommunityMessengerRoomSummary | null {
  const target = normalizeCmListRoomId(roomId);
  return (
    (data.chats ?? []).find((r) => normalizeCmListRoomId(String(r.id)) === target) ??
    (data.groups ?? []).find((r) => normalizeCmListRoomId(String(r.id)) === target) ??
    null
  );
}

function callStatusFromMeta(row: Record<string, unknown> | null | undefined): string {
  const meta = row?.metadata;
  if (!meta || typeof meta !== "object") return "";
  const status = (meta as { callStatus?: unknown }).callStatus;
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function isTerminalCallStatus(status: string): boolean {
  return (
    status === "ended" ||
    status === "cancelled" ||
    status === "rejected" ||
    status === "missed" ||
    status === "busy" ||
    status === "failed" ||
    status === "peer_busy"
  );
}

function isInFlightCallStatus(status: string): boolean {
  return status === "dialing" || status === "ringing";
}

/**
 * messages UPDATE — 홈 tip preview에 영향 있을 때만 hint.
 * 과거 행 UPDATE·동일 preview 재수신·in-flight←terminal rollback 은 drop.
 */
export function normalizeHomeMessageUpdateLivePatch(
  oldRow: Record<string, unknown> | null | undefined,
  newRow: Record<string, unknown>
): HomeRoomLiveTipPatch | null {
  const roomId = trimText(newRow.room_id);
  if (!roomId) return null;
  const preview = listPreviewFromMessengerMessageRow(newRow);
  if (!preview) return null;

  const messageId = trimText(newRow.id) || undefined;
  const oldContent = trimText(oldRow?.content);
  const newContent = trimText(newRow.content);
  const oldType = trimText(oldRow?.message_type);
  const newType = trimText(newRow.message_type) || "text";
  const oldCallStatus = callStatusFromMeta(oldRow);
  const newCallStatus = callStatusFromMeta(newRow);

  const contentSame = oldContent === newContent;
  const typeSame = !oldType || oldType === newType;
  const callStatusSame = oldCallStatus === newCallStatus;
  if (contentSame && typeSame && callStatusSame) return null;

  if (newType === "call_stub" && isTerminalCallStatus(oldCallStatus) && isInFlightCallStatus(newCallStatus)) {
    return null;
  }

  return {
    source: "message_update",
    roomId,
    messageId,
    preview,
  };
}

/**
 * rooms UPDATE — last_message / last_message_at / last_message_type 실변경만.
 */
export function normalizeHomeRoomTipUpdateLivePatch(
  oldRow: Record<string, unknown> | null | undefined,
  newRow: Record<string, unknown>
): HomeRoomLiveTipPatch | null {
  const roomId = trimText(newRow.id);
  if (!roomId) return null;

  const lastMessage = trimText(newRow.last_message);
  const lastMessageAt = trimText(newRow.last_message_at);
  if (!lastMessageAt) return null;

  const mtRaw = trimText(newRow.last_message_type) || "text";
  const lastMessageType = (
    mtRaw === "image" ||
    mtRaw === "file" ||
    mtRaw === "system" ||
    mtRaw === "call_stub" ||
    mtRaw === "voice" ||
    mtRaw === "sticker" ||
    mtRaw === "community_post_share"
      ? mtRaw
      : "text"
  ) as CommunityMessengerMessageType;

  const oldMessage = trimText(oldRow?.last_message);
  const oldAt = trimText(oldRow?.last_message_at);
  const oldType = trimText(oldRow?.last_message_type);
  if (oldMessage === lastMessage && oldAt === lastMessageAt && (!oldType || oldType === lastMessageType)) {
    return null;
  }

  return {
    source: "room_summary_update",
    roomId,
    preview: {
      lastMessage: lastMessage || "새 메시지",
      lastMessageType,
      lastMessageAt,
    },
  };
}

function patchRoomTipInList(
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
 * messages UPDATE → tip만. unread 미변경.
 * 과거 메시지(activity 더 오래됨)는 drop. call_stub는 기존 forward-only 가드 재사용.
 */
export function patchBootstrapRoomListForRealtimeMessageUpdate(
  data: CommunityMessengerBootstrap,
  roomId: string,
  messageRow: Record<string, unknown>
): CommunityMessengerBootstrap {
  const rid = String(roomId ?? "").trim();
  if (!rid) return data;
  const preview = listPreviewFromMessengerMessageRow(messageRow);
  if (!preview) return data;

  const existing = findRoomInBootstrapLists(data, rid);
  if (!existing) return data;

  const roomMs = lastEventAtMs(existing.lastMessageAt);
  const previewMs = lastEventAtMs(preview.lastMessageAt);
  if (previewMs > 0 && roomMs > 0 && previewMs < roomMs) {
    return data;
  }

  if (preview.lastMessageType === "call_stub" || existing.lastMessageType === "call_stub") {
    const incomingStatus = callStatusFromMeta(messageRow);
    if (
      isInFlightCallStatus(incomingStatus) &&
      existing.lastMessageType === "call_stub" &&
      String(existing.lastMessage ?? "") !== String(preview.lastMessage ?? "")
    ) {
      /** terminal(또는 다른 tip) 위에 dialing/ringing replay 금지 */
      return data;
    }
    if (!shouldApplyCallStubListPreviewPatch(existing, preview)) {
      return data;
    }
    return patchBootstrapRoomListForCallStubPreviewUpdate(data, rid, preview);
  }

  const nextChats = patchRoomTipInList(data.chats ?? [], rid, preview);
  const nextGroups = patchRoomTipInList(data.groups ?? [], rid, preview);
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  const versionMs = versionMsFromIso(preview.lastMessageAt);
  if (versionMs > 0) {
    bumpRoomTruthVersion(rid, versionMs, "realtime_message_update");
  }
  return { ...data, chats: nextChats, groups: nextGroups };
}

/**
 * rooms tip UPDATE — forward-only lastMessageAt. unread 미변경.
 */
export function patchBootstrapRoomListForRoomTipUpdate(
  data: CommunityMessengerBootstrap,
  roomId: string,
  tip: Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageType" | "lastMessageAt">
): CommunityMessengerBootstrap {
  const rid = String(roomId ?? "").trim();
  if (!rid) return data;
  const existing = findRoomInBootstrapLists(data, rid);
  if (!existing) return data;

  const roomMs = lastEventAtMs(existing.lastMessageAt);
  const tipMs = lastEventAtMs(tip.lastMessageAt);
  if (tipMs <= 0) return data;
  if (roomMs > tipMs) return data;

  if (tip.lastMessageType === "call_stub" || existing.lastMessageType === "call_stub") {
    if (!shouldApplyCallStubListPreviewPatch(existing, tip)) {
      return data;
    }
  }

  const nextChats = patchRoomTipInList(data.chats ?? [], rid, tip);
  const nextGroups = patchRoomTipInList(data.groups ?? [], rid, tip);
  if (nextChats === data.chats && nextGroups === data.groups) return data;
  const versionMs = versionMsFromIso(tip.lastMessageAt);
  if (versionMs > 0) {
    bumpRoomTruthVersion(rid, versionMs, "room_tip_update");
  }
  return { ...data, chats: nextChats, groups: nextGroups };
}
