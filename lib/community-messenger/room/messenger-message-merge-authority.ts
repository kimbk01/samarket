import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { resolveDeletedMessagePlaceholder } from "@/lib/community-messenger/message-actions/message-reply-policy";

/** Once tombstoned, a stale seed without deletedForEveryoneAt must not resurrect the body. */
export function retainDeletedForEveryoneAt(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null | undefined {
  const incomingTomb = typeof incoming === "string" && incoming.trim() ? incoming : null;
  const existingTomb = typeof existing === "string" && existing.trim() ? existing : null;
  return incomingTomb ?? existingTomb ?? incoming ?? existing;
}

/**
 * 1단계 결함 D-13·D-15 (2026-10-26): 전체삭제 묘비가 있는 행은 본문·첨부·답장 인용을 삭제 상태로 확정한다.
 * 병합이 묘비 시각만 지키고 본문은 늦게 온 옛 행(캐시·스냅샷 시드)으로 덮어
 * 받는 쪽 화면에 원문이 남던 문제 — 서버 매퍼(`mapCommunityMessengerDbMessageRowToMessage`)와 같은 결과로 맞춘다.
 * 묘비가 없는 행은 그대로 돌려준다(같은 객체).
 */
export function finalizeDeletedForEveryoneMessage<T extends CommunityMessengerMessage>(row: T): T {
  const at = typeof row.deletedForEveryoneAt === "string" ? row.deletedForEveryoneAt.trim() : "";
  if (!at) return row;
  const placeholder = resolveDeletedMessagePlaceholder();
  const alreadyFinal =
    row.content === placeholder &&
    !row.replyToMessageId &&
    !row.imageAlbumUrls &&
    !row.imagePreviewUrl &&
    !row.imageOriginalUrl &&
    !row.fileName &&
    row.voiceDurationSeconds == null;
  if (alreadyFinal) return row;
  const {
    replyToMessageId: _replyToMessageId,
    replyPreviewText: _replyPreviewText,
    replyPreviewType: _replyPreviewType,
    replySenderLabelSnapshot: _replySenderLabelSnapshot,
    imageAlbumUrls: _imageAlbumUrls,
    imageAlbumPreviewUrls: _imageAlbumPreviewUrls,
    imageAlbumOriginalUrls: _imageAlbumOriginalUrls,
    imagePreviewUrl: _imagePreviewUrl,
    imageOriginalUrl: _imageOriginalUrl,
    imageWidth: _imageWidth,
    imageHeight: _imageHeight,
    fileName: _fileName,
    fileMimeType: _fileMimeType,
    fileSizeBytes: _fileSizeBytes,
    voiceDurationSeconds: _voiceDurationSeconds,
    voiceWaveformPeaks: _voiceWaveformPeaks,
    voiceMimeType: _voiceMimeType,
    ...rest
  } = row;
  return { ...rest, content: placeholder, deletedForEveryoneAt: at } as T;
}
