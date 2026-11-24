/**
 * 영상 메시지 표시 필드 — 서버 매핑·실시간 스냅샷·클라 렌더가 같은 규칙으로 읽는다(client-safe · 순수).
 * 메시지 객체에 필드가 없으면(실시간 행·bump 등) `metadata` 에서 읽는다.
 */
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { messengerVideoDimension } from "@/lib/community-messenger/upload/messenger-video-upload-policy";

export type MessengerVideoClientFields = {
  videoThumbUrl: string | null;
  videoDurationMs: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  fileSizeBytes: number | null;
  fileMimeType: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function posInt(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function messengerVideoClientFieldsFromMetadata(metadata: Record<string, unknown> | null | undefined): MessengerVideoClientFields {
  const m = (metadata ?? {}) as Record<string, unknown>;
  return {
    videoThumbUrl: str(m.video_thumb_url),
    videoDurationMs: posInt(m.video_duration_ms),
    videoWidth: messengerVideoDimension(m.video_width),
    videoHeight: messengerVideoDimension(m.video_height),
    fileSizeBytes: posInt(m.fileSizeBytes),
    fileMimeType: str(m.mimeType),
  };
}

/** 렌더용 — 메시지 필드 우선, 없으면 metadata. 영상이 아니거나 전체삭제면 null. */
export function resolveMessengerVideoFields(
  message: Pick<
    CommunityMessengerMessage,
    "messageType" | "metadata" | "videoThumbUrl" | "videoDurationMs" | "videoWidth" | "videoHeight" | "fileSizeBytes" | "fileMimeType" | "deletedForEveryoneAt"
  >
): MessengerVideoClientFields | null {
  if (message.messageType !== "video" || message.deletedForEveryoneAt) return null;
  const meta = messengerVideoClientFieldsFromMetadata(message.metadata ?? null);
  return {
    videoThumbUrl: str(message.videoThumbUrl) ?? meta.videoThumbUrl,
    videoDurationMs: posInt(message.videoDurationMs) ?? meta.videoDurationMs,
    videoWidth: messengerVideoDimension(message.videoWidth) ?? meta.videoWidth,
    videoHeight: messengerVideoDimension(message.videoHeight) ?? meta.videoHeight,
    fileSizeBytes: posInt(message.fileSizeBytes) ?? meta.fileSizeBytes,
    fileMimeType: str(message.fileMimeType) ?? meta.fileMimeType,
  };
}
