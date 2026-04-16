import type { CommunityMessengerMessage, CommunityMessengerMessageType } from "@/lib/community-messenger/types";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

const MAX_BUMP_CONTENT_CHARS = 14_000;

const ALLOWED_TYPES: ReadonlySet<CommunityMessengerMessageType> = new Set([
  "text",
  "sticker",
  "image",
  "file",
  "voice",
  "system",
  "call_stub",
]);

/** 서버→Realtime bump 페이로드용 — 수신 측은 `parseCommunityMessengerBumpMessageSnapshot` 으로 검증 후 병합 */
export function serializeCommunityMessengerMessageForBump(
  msg: CommunityMessengerMessage
): Record<string, unknown> | null {
  const id = String(msg.id ?? "").trim();
  if (!id || !isUuidLikeString(id)) return null;
  const roomId = String(msg.roomId ?? "").trim();
  if (!roomId) return null;
  const senderId = String(msg.senderId ?? "").trim();
  if (!senderId) return null;
  if (!ALLOWED_TYPES.has(msg.messageType)) return null;
  let content = String(msg.content ?? "");
  if (content.length > MAX_BUMP_CONTENT_CHARS) {
    content = `${content.slice(0, MAX_BUMP_CONTENT_CHARS - 1)}…`;
  }
  const row: Record<string, unknown> = {
    id,
    roomId,
    senderId,
    senderLabel: String(msg.senderLabel ?? "").slice(0, 200),
    messageType: msg.messageType,
    content,
    createdAt: String(msg.createdAt ?? "").trim(),
    callKind: msg.callKind ?? null,
    callStatus: msg.callStatus ?? null,
    callSessionId: msg.callSessionId ?? null,
  };
  if (msg.clientMessageId) row.clientMessageId = String(msg.clientMessageId).trim();
  if (msg.voiceDurationSeconds != null) row.voiceDurationSeconds = msg.voiceDurationSeconds;
  if (msg.voiceMimeType) row.voiceMimeType = String(msg.voiceMimeType).slice(0, 120);
  if (Array.isArray(msg.voiceWaveformPeaks) && msg.voiceWaveformPeaks.length > 0) {
    row.voiceWaveformPeaks = msg.voiceWaveformPeaks.slice(0, 256);
  }
  if (msg.fileName) row.fileName = String(msg.fileName).slice(0, 400);
  if (msg.fileMimeType) row.fileMimeType = String(msg.fileMimeType).slice(0, 120);
  if (typeof msg.fileSizeBytes === "number" && Number.isFinite(msg.fileSizeBytes)) {
    row.fileSizeBytes = Math.max(0, Math.floor(msg.fileSizeBytes));
  }
  return row;
}

/**
 * 서비스 롤이 보낸 bump 의 `message` 블록만 신뢰(클라 임의 broadcast 와 구분 불가 → 엄격 검증).
 * `fromUserId`·canonical 방·`messageId` 힌트와 모순되면 null.
 */
export function parseCommunityMessengerBumpMessageSnapshot(
  payload: Record<string, unknown>,
  viewerUserId: string
): CommunityMessengerMessage | null {
  const viewer = String(viewerUserId ?? "").trim();
  if (!viewer) return null;
  const fromUserId = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
  const canonicalRoomId =
    (typeof payload.canonicalRoomId === "string" ? payload.canonicalRoomId.trim() : "") ||
    (typeof payload.roomId === "string" ? payload.roomId.trim() : "");
  const messageIdHint =
    typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  const raw = payload.message;
  if (!fromUserId || !canonicalRoomId || !raw || typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const id = typeof m.id === "string" ? m.id.trim() : "";
  if (!id || !isUuidLikeString(id)) return null;
  if (messageIdHint && id !== messageIdHint) return null;
  const roomId = typeof m.roomId === "string" ? m.roomId.trim() : "";
  if (!roomId || roomId.toLowerCase() !== canonicalRoomId.toLowerCase()) return null;
  const senderId = typeof m.senderId === "string" ? m.senderId.trim() : "";
  if (!senderId || senderId !== fromUserId) return null;
  const mt = m.messageType;
  if (typeof mt !== "string" || !ALLOWED_TYPES.has(mt as CommunityMessengerMessageType)) return null;
  const messageType = mt as CommunityMessengerMessageType;
  const content = typeof m.content === "string" ? m.content : "";
  if (content.length > MAX_BUMP_CONTENT_CHARS + 50) return null;
  const createdAt = typeof m.createdAt === "string" ? m.createdAt.trim() : "";
  if (!createdAt) return null;
  const senderLabel = typeof m.senderLabel === "string" ? m.senderLabel.slice(0, 200) : "";
  const isMine = messengerUserIdsEqual(senderId, viewer);
  const clientMessageId =
    typeof m.clientMessageId === "string" && m.clientMessageId.trim() ? m.clientMessageId.trim() : null;
  const out: CommunityMessengerMessage = {
    id,
    roomId: canonicalRoomId,
    senderId,
    senderLabel,
    messageType,
    content,
    createdAt,
    clientMessageId,
    isMine,
    callKind: (m.callKind as CommunityMessengerMessage["callKind"]) ?? null,
    callStatus: (m.callStatus as CommunityMessengerMessage["callStatus"]) ?? null,
    callSessionId: typeof m.callSessionId === "string" ? m.callSessionId.trim() || null : null,
  };
  if (typeof m.voiceDurationSeconds === "number" && Number.isFinite(m.voiceDurationSeconds)) {
    out.voiceDurationSeconds = Math.max(0, Math.floor(m.voiceDurationSeconds));
  }
  if (typeof m.voiceMimeType === "string" && m.voiceMimeType.trim()) {
    out.voiceMimeType = m.voiceMimeType.trim().slice(0, 120);
  }
  if (Array.isArray(m.voiceWaveformPeaks)) {
    const peaks = m.voiceWaveformPeaks.filter((x) => typeof x === "number" && Number.isFinite(x)) as number[];
    if (peaks.length) out.voiceWaveformPeaks = peaks.slice(0, 256);
  }
  if (typeof m.fileName === "string" && m.fileName.trim()) out.fileName = m.fileName.trim().slice(0, 400);
  if (typeof m.fileMimeType === "string" && m.fileMimeType.trim()) {
    out.fileMimeType = m.fileMimeType.trim().slice(0, 120);
  }
  if (typeof m.fileSizeBytes === "number" && Number.isFinite(m.fileSizeBytes)) {
    out.fileSizeBytes = Math.max(0, Math.floor(m.fileSizeBytes));
  }
  return out;
}
