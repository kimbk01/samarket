/**
 * 채팅 영상 보내기 — 서버 파이프라인 (설계 §3-4·§3-5).
 *
 * 영상은 서버 함수가 파일을 **내려받지 않는다**(D7). 클라이언트가 최종 경로로 직접 PUT 하고,
 * 서버는 확정 때 Storage 메타(크기·contentType)와 앞 64바이트(Range)만 확인한다.
 *
 * 누수 계약: 확정 거절·전송 거절·deduped·취소 → 이번 업로드 두 객체(영상·썸네일) 즉시 삭제.
 * 그래도 남는 것(앱 종료·네트워크 단절)은 일일 GC(`messenger-video-orphan-gc`) 가 회수한다.
 */
import { randomUUID } from "crypto";
import type { getSupabaseServer } from "@/lib/chat/supabase-server";
import { sendCommunityMessengerVideoMessage } from "@/lib/community-messenger/service";
import { keepMessengerNotifyAliveAfterAck } from "@/lib/community-messenger/server/keep-messenger-notify-alive-after-ack";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { runMediaSendFanoutAfterCommit } from "@/lib/community-messenger/server/media-send-fanout";
import type { MessengerSendKnownRoom } from "@/lib/community-messenger/server/assert-messenger-room-send-allowed";
import { addSupabaseCallRequestUnits } from "@/lib/perf/supabase-call-counter";
import { purgeMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";
import { resolveMessengerMediaUploadBucket } from "@/lib/community-messenger/server/messenger-media-bucket";
import {
  MESSENGER_PRIVATE_MEDIA_BUCKET,
  type MessengerMediaBucket,
} from "@/lib/community-messenger/media/messenger-media-ref";
import {
  buildMessengerVideoPaths,
  isMessengerJpegSignature,
  isMessengerVideoSignature,
  MESSENGER_VIDEO_CONTAINERS,
  MESSENGER_VIDEO_THUMB_CONTENT_TYPE,
  MESSENGER_VIDEO_THUMB_MAX_BYTES,
  messengerVideoDimension,
  parseMessengerVideoPath,
  precheckMessengerVideo,
  type MessengerVideoExt,
} from "@/lib/community-messenger/upload/messenger-video-upload-policy";

type Sb = ReturnType<typeof getSupabaseServer>;

export type MessengerVideoRouteResult = { status: number; body: Record<string, unknown> };

/** 영상은 비공개 버킷에만 둔다 — 레거시 공개 버킷(post-images)이면 영상 보내기 자체를 막는다. */
async function resolveVideoBucket(sb: Sb): Promise<MessengerMediaBucket | null> {
  const b = await resolveMessengerMediaUploadBucket(sb);
  return b === MESSENGER_PRIVATE_MEDIA_BUCKET ? b : null;
}

/** 1단계 — 업로드 전 검사 + 영상·썸네일 서명 업로드 URL 발급(최종 경로). */
export async function createMessengerVideoUploadUrls(input: {
  sb: Sb;
  userId: string;
  roomId: string;
  bytes: unknown;
  durationMs: unknown;
  ext: unknown;
}): Promise<MessengerVideoRouteResult> {
  const pre = precheckMessengerVideo({
    bytes: Number(input.bytes),
    durationMs: input.durationMs == null ? null : Number(input.durationMs),
    ext: typeof input.ext === "string" ? input.ext : null,
  });
  if (!pre.ok) return { status: pre.error === "video_too_large" ? 413 : 400, body: { ok: false, error: pre.error } };
  const bucketName = await resolveVideoBucket(input.sb);
  if (!bucketName) return { status: 503, body: { ok: false, error: "video_unavailable" } };
  const bucket = input.sb.storage.from(bucketName);
  const paths = buildMessengerVideoPaths({ userId: input.userId, roomId: input.roomId, uuid: randomUUID(), ext: pre.ext });
  const [v, t] = await Promise.all([
    bucket.createSignedUploadUrl(paths.videoPath),
    bucket.createSignedUploadUrl(paths.thumbPath),
  ]);
  if (v.error || !v.data?.signedUrl || t.error || !t.data?.signedUrl) {
    return { status: 500, body: { ok: false, error: "upload_url_failed" } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      videoPath: paths.videoPath,
      videoSignedUrl: v.data.signedUrl,
      thumbSignedUrl: t.data.signedUrl,
      videoContentType: MESSENGER_VIDEO_CONTAINERS[pre.ext],
      thumbContentType: MESSENGER_VIDEO_THUMB_CONTENT_TYPE,
    },
  };
}

/**
 * 앞 64바이트만 읽는다(파일 전체 다운로드 금지). Range 를 요청하고, 서버가 Range 를 무시해 전체를 보내더라도
 * 스트림에서 64바이트만 받고 연결을 끊는다(함수 메모리·송신량이 파일 크기와 무관).
 */
async function readObjectHead(sb: Sb, bucket: MessengerMediaBucket, path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-63" } });
    if (!res.ok && res.status !== 206) return null;
    const out = new Uint8Array(64);
    let filled = 0;
    const reader = res.body?.getReader();
    if (!reader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      return buf.subarray(0, 64);
    }
    try {
      while (filled < 64) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const take = Math.min(64 - filled, value.length);
        out.set(value.subarray(0, take), filled);
        filled += take;
      }
    } finally {
      void reader.cancel().catch(() => {});
    }
    return out.subarray(0, filled);
  } catch {
    return null;
  }
}

type ObjectInfo = { size: number; contentType: string };

/** Storage 메타(크기·contentType) — `info` 를 쓰고, 지원 안 되면 폴더 목록 검색으로 같은 값을 읽는다. */
async function readObjectInfo(sb: Sb, bucket: MessengerMediaBucket, path: string): Promise<ObjectInfo | null> {
  const api = sb.storage.from(bucket);
  try {
    const { data, error } = await api.info(path);
    if (!error && data) {
      const d = data as { size?: unknown; contentType?: unknown; metadata?: Record<string, unknown> | null };
      const size = Number(d.size ?? d.metadata?.size ?? NaN);
      const contentType = String(d.contentType ?? d.metadata?.mimetype ?? "").toLowerCase().trim();
      if (Number.isFinite(size)) return { size, contentType };
    }
  } catch {
    /* 아래 목록 검색 */
  }
  try {
    const slash = path.lastIndexOf("/");
    const dir = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const { data, error } = await api.list(dir, { search: name, limit: 5 });
    if (error || !Array.isArray(data)) return null;
    const row = (data as Array<{ name?: string; metadata?: Record<string, unknown> | null }>).find((o) => o?.name === name);
    if (!row?.metadata) return null;
    const size = Number(row.metadata.size ?? NaN);
    const contentType = String(row.metadata.mimetype ?? "").toLowerCase().trim();
    return Number.isFinite(size) ? { size, contentType } : null;
  } catch {
    return null;
  }
}

/** 서버가 확인한 업로드 객체 — 실패 시 두 경로를 지운다. */
export async function verifyMessengerVideoUpload(input: {
  sb: Sb;
  bucket: MessengerMediaBucket;
  videoPath: string;
  thumbPath: string;
  ext: MessengerVideoExt;
  durationMs: number;
}): Promise<{ ok: true; videoBytes: number } | { ok: false; status: number; error: string }> {
  const [vInfo, tInfo] = await Promise.all([
    readObjectInfo(input.sb, input.bucket, input.videoPath),
    readObjectInfo(input.sb, input.bucket, input.thumbPath),
  ]);
  if (!vInfo || !tInfo) return { ok: false, status: 400, error: "upload_missing" };
  const pre = precheckMessengerVideo({ bytes: vInfo.size, durationMs: input.durationMs, ext: input.ext });
  if (!pre.ok) return { ok: false, status: pre.error === "video_too_large" ? 413 : 400, error: pre.error };
  /* 클라이언트가 PUT 때 붙인 contentType 은 신뢰하지 않는다 — 정규 타입과 다르면 거절(서명 URL 응답 타입 고정). */
  if (vInfo.contentType !== MESSENGER_VIDEO_CONTAINERS[input.ext]) return { ok: false, status: 415, error: "unsupported_video" };
  if (tInfo.contentType !== MESSENGER_VIDEO_THUMB_CONTENT_TYPE) return { ok: false, status: 415, error: "unsupported_video" };
  if (tInfo.size <= 0 || tInfo.size > MESSENGER_VIDEO_THUMB_MAX_BYTES) return { ok: false, status: 400, error: "unsupported_video" };
  const [vHead, tHead] = await Promise.all([
    readObjectHead(input.sb, input.bucket, input.videoPath),
    readObjectHead(input.sb, input.bucket, input.thumbPath),
  ]);
  if (!vHead || !isMessengerVideoSignature(vHead)) return { ok: false, status: 415, error: "unsupported_video" };
  if (!tHead || !isMessengerJpegSignature(tHead)) return { ok: false, status: 415, error: "unsupported_video" };
  return { ok: true, videoBytes: vInfo.size };
}

/** 2단계 — 확정: 검증 → 메시지 INSERT(cid 멱등) → 거절·deduped purge → 서버 bump. */
export async function finalizeMessengerVideoUpload(input: {
  sb: Sb;
  userId: string;
  canonicalRoomId: string;
  rawRouteRoomId: string;
  videoPath: unknown;
  durationMs: unknown;
  width: unknown;
  height: unknown;
  clientMessageId: string | null;
  /** F3(2026-11-25) — 라우트 송신 가드가 읽은 방 행. 있으면 글 보내기와 같은 알림·배지·bump 경로 */
  knownRoom?: MessengerSendKnownRoom | null;
}): Promise<MessengerVideoRouteResult> {
  const { sb, canonicalRoomId } = input;
  const parsed = parseMessengerVideoPath({ userId: input.userId, roomId: canonicalRoomId, path: input.videoPath });
  /* 타인·타 방·경로 탈출은 삭제도 하지 않는다(소유 검증 실패). */
  if (!parsed.ok) return { status: 400, body: { ok: false, error: "staged_path_invalid" } };
  const bucket = await resolveVideoBucket(sb);
  if (!bucket) return { status: 503, body: { ok: false, error: "video_unavailable" } };
  const ownPaths = [parsed.videoPath, parsed.thumbPath];
  const purge = () => purgeMessengerMediaStoragePaths(sb, ownPaths, { roomId: canonicalRoomId, bucket });

  const durationMs = Math.floor(Number(input.durationMs));
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    await purge();
    return { status: 400, body: { ok: false, error: "unsupported_video" } };
  }
  const verified = await verifyMessengerVideoUpload({
    sb,
    bucket,
    videoPath: parsed.videoPath,
    thumbPath: parsed.thumbPath,
    ext: parsed.ext,
    durationMs,
  });
  if (!verified.ok) {
    await purge();
    return { status: verified.status, body: { ok: false, error: verified.error } };
  }

  const storage = sb.storage.from(bucket);
  const videoUrl = storage.getPublicUrl(parsed.videoPath).data.publicUrl;
  const thumbUrl = storage.getPublicUrl(parsed.thumbPath).data.publicUrl;

  const result = await sendCommunityMessengerVideoMessage({
    userId: input.userId,
    roomId: canonicalRoomId,
    videoPublicUrl: videoUrl,
    thumbPublicUrl: thumbUrl,
    videoPath: parsed.videoPath,
    thumbPath: parsed.thumbPath,
    storageBucket: bucket,
    mimeType: MESSENGER_VIDEO_CONTAINERS[parsed.ext],
    fileSizeBytes: verified.videoBytes,
    durationMs,
    width: messengerVideoDimension(input.width),
    height: messengerVideoDimension(input.height),
    clientMessageId: input.clientMessageId,
    onNotifyScheduled: keepMessengerNotifyAliveAfterAck,
    knownRoom: input.knownRoom ?? null,
  });
  if (!result.ok) {
    await purge();
    return { status: 400, body: result as Record<string, unknown> };
  }
  if (result.deduped) {
    /* 멱등 재전송 — DB 행은 이전 업로드를 가리킨다. 이번 업로드분 정리. */
    await purge();
  }
  const { fanout, ...body } = result;
  if (fanout && result.message) {
    addSupabaseCallRequestUnits(fanout.recipientUserIds.length);
    await runMediaSendFanoutAfterCommit({
      rawRouteRoomId: input.rawRouteRoomId,
      canonicalRoomId,
      userId: input.userId,
      message: result.message,
      fanout,
    }).catch(() => undefined);
    return { status: 200, body: body as Record<string, unknown> };
  }
  try {
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: input.rawRouteRoomId,
      canonicalRoomId,
      fromUserId: input.userId,
      messageId: result.message?.id,
      messageCreatedAt: result.message?.createdAt,
      messageForBump: result.message ?? null,
    });
  } catch {
    /* best-effort: 전송은 커밋됨 */
  }
  return { status: 200, body: body as Record<string, unknown> };
}

/** 취소 — 확정 전 사용자가 ✕ 를 누름. 본인·이 방 경로만 지운다(메시지가 이미 있으면 지우지 않음). */
export async function cancelMessengerVideoUpload(input: {
  sb: Sb;
  userId: string;
  canonicalRoomId: string;
  videoPath: unknown;
}): Promise<MessengerVideoRouteResult> {
  const parsed = parseMessengerVideoPath({ userId: input.userId, roomId: input.canonicalRoomId, path: input.videoPath });
  if (!parsed.ok) return { status: 400, body: { ok: false, error: "staged_path_invalid" } };
  const bucket = await resolveVideoBucket(input.sb);
  if (!bucket) return { status: 200, body: { ok: true } };
  /* 확정과 경합: 이미 메시지가 이 경로를 가리키면 삭제하지 않는다(그 메시지 삭제 경로가 지운다). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: referenced } = await (input.sb as any)
    .from("community_messenger_messages")
    .select("id")
    .eq("room_id", input.canonicalRoomId)
    .eq("metadata->>storage_path", parsed.videoPath)
    .limit(1);
  if (Array.isArray(referenced) && referenced.length > 0) return { status: 200, body: { ok: true, kept: true } };
  await purgeMessengerMediaStoragePaths(input.sb, [parsed.videoPath, parsed.thumbPath], {
    roomId: input.canonicalRoomId,
    bucket,
  });
  return { status: 200, body: { ok: true } };
}
