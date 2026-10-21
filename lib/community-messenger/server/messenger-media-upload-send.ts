import { randomUUID } from "crypto";
import type { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  sendCommunityMessengerFileMessage,
  sendCommunityMessengerImageMessage,
} from "@/lib/community-messenger/service";
import { keepMessengerNotifyAliveAfterAck } from "@/lib/community-messenger/server/keep-messenger-notify-alive-after-ack";
import { publishMessengerRoomBumpBounded } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { purgeMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";
import { validateMessengerFileUpload } from "@/lib/community-messenger/upload/validate-messenger-file-upload";
import {
  MESSENGER_FILE_UPLOAD_MAX_BYTES,
  deriveMessengerFileExtension,
  isMessengerFileAllowedExt,
  MESSENGER_FILE_UPLOAD_HARD_BLOCK_EXTS,
} from "@/lib/community-messenger/upload/messenger-file-upload-policy";
import {
  buildMessengerStagingPath,
  messengerFinalMediaDir,
  messengerImageStagingExtForMime,
  messengerStagingDir,
  MESSENGER_IMAGE_UPLOAD_ALLOWED_MIMES,
  MESSENGER_IMAGE_UPLOAD_MAX_BYTES,
  MESSENGER_IMAGE_UPLOAD_MAX_FILES,
  parseMessengerStagedPath,
  type MessengerStagingKind,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";
import {
  processMessengerImageUploads,
  sniffMessengerImageMime,
  type MessengerImageUploadInput,
} from "@/lib/community-messenger/server/messenger-image-upload-process";
import { resolveMessengerMediaUploadBucket } from "@/lib/community-messenger/server/messenger-media-bucket";
import {
  MESSENGER_LEGACY_MEDIA_BUCKET,
  MESSENGER_PRIVATE_MEDIA_BUCKET,
  type MessengerMediaBucket,
} from "@/lib/community-messenger/media/messenger-media-ref";

/**
 * D-3 — 메신저 이미지·파일 전송 공용 서버 파이프라인.
 * multipart(작은 파일·구 앱 바이너리)와 staged direct upload(큰 파일) 가 **같은** 검증·가공·전송·purge·bump
 * 코드를 탄다. 라우트는 입력 수집(form / staging 다운로드)만 다르다.
 *
 * 계약 유지: 서버만 bump 발행(publishMessengerRoomBumpBounded) · cid 멱등(서버 UNIQUE) ·
 * IMG-02 거절/중복(deduped) 시 이번 업로드분 purge.
 */

type Sb = ReturnType<typeof getSupabaseServer>;

export type MessengerMediaRouteResult = { status: number; body: Record<string, unknown> };

/**
 * C-4: 신규 업로드 버킷은 `resolveMessengerMediaUploadBucket` 이 결정한다(비공개 `messenger-media` 존재 시 그쪽,
 * 아니면 레거시 `post-images`). staging 도 같은 버킷 — 확정 시 두 버킷을 순서대로 찾는다(전환 경계 호환).
 */
const ALL_MEDIA_BUCKETS: MessengerMediaBucket[] = [MESSENGER_PRIVATE_MEDIA_BUCKET, MESSENGER_LEGACY_MEDIA_BUCKET];

async function publishBumpBestEffort(input: {
  rawRouteRoomId: string;
  canonicalRoomId: string;
  userId: string;
  message: CommunityMessengerMessage | null | undefined;
}): Promise<void> {
  try {
    /** M-1·M-13: 공용 bounded 예산(≤1.5s) — 이전 기본 5s 타임아웃이 ACK 를 막을 수 있었다 */
    await publishMessengerRoomBumpBounded({
      rawRouteRoomId: input.rawRouteRoomId,
      canonicalRoomId: input.canonicalRoomId,
      fromUserId: input.userId,
      messageId: input.message?.id,
      messageCreatedAt: input.message?.createdAt,
      messageForBump: input.message ?? null,
    });
  } catch {
    /* best-effort: 전송은 이미 커밋됨 — 수신측은 Postgres Realtime·재요청으로 정합 */
  }
}

/** 이미지 묶음 → 가공·업로드 → 전송 → purge(거절·deduped) → bump. multipart·staged 공용. */
export async function sendMessengerImageUploadBatch(input: {
  sb: Sb;
  userId: string;
  canonicalRoomId: string;
  rawRouteRoomId: string;
  images: MessengerImageUploadInput[];
  clientMessageId: string | null;
}): Promise<MessengerMediaRouteResult> {
  const { sb, canonicalRoomId } = input;
  const bucketName = await resolveMessengerMediaUploadBucket(sb);
  const purgeCtx = { roomId: canonicalRoomId, bucket: bucketName };
  const bucket = sb.storage.from(bucketName);
  const processed = await processMessengerImageUploads({
    bucket,
    baseDir: messengerFinalMediaDir("image", input.userId, canonicalRoomId),
    images: input.images,
  });
  if (!processed.ok) {
    // IMG-02: 앞선 파일은 이미 올라갔으므로 고아 정리 후 거부.
    await purgeMessengerMediaStoragePaths(sb, processed.uploadedStoragePaths, purgeCtx);
    return { status: processed.status, body: { ok: false, error: processed.error } };
  }

  const result = await sendCommunityMessengerImageMessage({
    userId: input.userId,
    roomId: canonicalRoomId,
    items: processed.items.map((it) => ({ ...it, storageBucket: bucketName })),
    // CHAT-05: 업로드 멱등 키(클라가 재전송 시 동일 값을 보냄).
    clientMessageId: input.clientMessageId,
    onNotifyScheduled: keepMessengerNotifyAliveAfterAck,
  });

  if (!result.ok) {
    // IMG-02: 전송 거절 → 올린 파일 고아 정리.
    await purgeMessengerMediaStoragePaths(sb, processed.uploadedStoragePaths, purgeCtx);
    return { status: 400, body: result as Record<string, unknown> };
  }
  if (result.deduped) {
    // CHAT-05 멱등 재전송: DB 행은 이전 업로드를 가리킨다 — 이번 요청 업로드분은 고아이므로 정리.
    await purgeMessengerMediaStoragePaths(sb, processed.uploadedStoragePaths, purgeCtx);
  }
  await publishBumpBestEffort({
    rawRouteRoomId: input.rawRouteRoomId,
    canonicalRoomId,
    userId: input.userId,
    message: result.message,
  });
  return { status: 200, body: result as Record<string, unknown> };
}

/** 파일 → NEW-07 검증 → 정규 contentType 으로 최종 경로 업로드 → 전송 → purge(거절·deduped) → bump. */
export async function sendMessengerFileUpload(input: {
  sb: Sb;
  userId: string;
  canonicalRoomId: string;
  rawRouteRoomId: string;
  buf: Buffer;
  displayName: string;
  browserMime: string;
  clientMessageId: string | null;
}): Promise<MessengerMediaRouteResult> {
  const { sb, canonicalRoomId } = input;
  if (input.buf.length > MESSENGER_FILE_UPLOAD_MAX_BYTES) {
    return { status: 413, body: { ok: false, error: "file_too_large" } };
  }
  const ext = deriveMessengerFileExtension(input.displayName);
  // NEW-07: 확장자·MIME·파일 서명이 모두 허용 타입과 일치해야 하며, 저장 contentType 은
  // 브라우저 값이 아닌 정규 안전 타입으로 고정한다(html·svg·js·apk 등 차단, 폴리글랏 방어).
  const validated = validateMessengerFileUpload(input.buf, ext, input.browserMime);
  if (!validated.ok) {
    return { status: 415, body: { ok: false, error: validated.error } };
  }
  const path = `${messengerFinalMediaDir("file", input.userId, canonicalRoomId)}/${randomUUID()}.${validated.ext}`;
  const bucketName = await resolveMessengerMediaUploadBucket(sb);
  const purgeCtx = { roomId: canonicalRoomId, bucket: bucketName };
  const bucket = sb.storage.from(bucketName);
  const { error: upErr } = await bucket.upload(path, input.buf, {
    contentType: validated.canonicalContentType,
    upsert: false,
  });
  if (upErr) {
    return { status: 500, body: { ok: false, error: upErr.message ?? "upload_failed" } };
  }
  const {
    data: { publicUrl },
  } = bucket.getPublicUrl(path);

  const result = await sendCommunityMessengerFileMessage({
    userId: input.userId,
    roomId: canonicalRoomId,
    filePublicUrl: publicUrl,
    storagePath: path,
    storageBucket: bucketName,
    fileName: input.displayName,
    mimeType: validated.canonicalContentType,
    fileSizeBytes: input.buf.length,
    // CHAT-05: 업로드 멱등 키(클라가 재전송 시 동일 값을 보냄).
    clientMessageId: input.clientMessageId,
    onNotifyScheduled: keepMessengerNotifyAliveAfterAck,
  });

  if (!result.ok) {
    // IMG-02: 전송 거절 → 올린 파일 고아 정리.
    await purgeMessengerMediaStoragePaths(sb, [path], purgeCtx);
    return { status: 400, body: result as Record<string, unknown> };
  }
  if (result.deduped) {
    // D-7 / CHAT-05: 멱등 재전송 — DB 행은 이전 업로드를 가리킨다(서비스가 원 행을 반환). 이번 업로드분 정리.
    await purgeMessengerMediaStoragePaths(sb, [path], purgeCtx);
  }
  await publishBumpBestEffort({
    rawRouteRoomId: input.rawRouteRoomId,
    canonicalRoomId,
    userId: input.userId,
    message: result.message,
  });
  return { status: 200, body: result as Record<string, unknown> };
}

/**
 * staging 객체를 내려받고 **즉시 삭제**한다(성공·실패 모든 경우 staging 을 남기지 않음).
 * 반환 bytes 는 메모리에만 있다 — 이후 단계 실패해도 staging 잔존 없음.
 */
export async function takeMessengerStagedObject(
  sb: Sb,
  path: string
): Promise<{ ok: true; buf: Buffer } | { ok: false; error: "upload_missing" }> {
  const preferred = await resolveMessengerMediaUploadBucket(sb);
  const order = [preferred, ...ALL_MEDIA_BUCKETS.filter((b) => b !== preferred)];
  try {
    for (const name of order) {
      try {
        const dl = await sb.storage.from(name).download(path);
        if (!dl.error && dl.data) return { ok: true, buf: Buffer.from(await dl.data.arrayBuffer()) };
      } catch {
        /* 다음 버킷 */
      }
    }
    return { ok: false, error: "upload_missing" };
  } finally {
    await removeMessengerStagedObjects(sb, [path]);
  }
}

/** staging 정리 — 비공개 버킷 사용 중이면 전환 경계(업로드 URL 발급 후 버킷 변경) 대비 두 버킷 모두에서 제거(없는 키 remove 는 no-op). */
export async function removeMessengerStagedObjects(sb: Sb, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const preferred = await resolveMessengerMediaUploadBucket(sb);
  const buckets = preferred === MESSENGER_PRIVATE_MEDIA_BUCKET ? ALL_MEDIA_BUCKETS : [MESSENGER_LEGACY_MEDIA_BUCKET];
  for (const bucket of buckets) {
    await purgeMessengerMediaStoragePaths(sb, paths, { bucket });
  }
}

/** 서명 업로드 URL 발급(staging). 클라이언트는 이 URL 로 Storage 에 직접 PUT 한다. */
/** staging 객체가 확정(finalize) 없이 남아 있으면 이 시간이 지난 뒤 정리한다. 확정은 PUT 직후 수 초 내에 끝나고,
 * 재시도는 항상 새 URL 을 발급받으므로(이전 staging 재사용 없음) 1시간 지난 staging 은 버려진 업로드다. */
export const MESSENGER_STAGING_ABANDON_MS = 60 * 60 * 1000;

/**
 * 버려진 staged 업로드 정리(크론 없이) — 같은 사용자·같은 방의 staging 폴더에서 오래된 객체만 삭제.
 * 범위: 본인 `${userId}/community/messenger-{kind}-staging/${roomId}` 만 — 최종 미디어 경로·타인 경로는 건드리지 않는다.
 * best-effort: 실패해도 업로드 URL 발급을 막지 않는다.
 */
export async function purgeStaleMessengerStagingObjects(input: {
  sb: Sb;
  kind: MessengerStagingKind;
  userId: string;
  roomId: string;
  nowMs?: number;
  /** C-4: 미지정 시 레거시 post-images (기존 동작). */
  bucket?: MessengerMediaBucket;
}): Promise<number> {
  const dir = messengerStagingDir(input.kind, input.userId, input.roomId);
  const cutoff = (input.nowMs ?? Date.now()) - MESSENGER_STAGING_ABANDON_MS;
  try {
    const bucket = input.sb.storage.from(input.bucket ?? MESSENGER_LEGACY_MEDIA_BUCKET);
    const { data, error } = await bucket.list(dir, { limit: 100 });
    if (error || !Array.isArray(data)) return 0;
    const stale: string[] = [];
    for (const obj of data as Array<{ name?: string; created_at?: string | null; id?: string | null }>) {
      const name = typeof obj?.name === "string" ? obj.name : "";
      /** 폴더 항목(id 없음)·이상한 이름 제외 — staging leaf 규칙(uuid.ext)과 일치하는 것만 */
      if (!name || !obj.id) continue;
      const parsed = parseMessengerStagedPath({
        kind: input.kind,
        userId: input.userId,
        roomId: input.roomId,
        path: `${dir}/${name}`,
      });
      if (!parsed.ok) continue;
      const createdMs = obj.created_at ? new Date(obj.created_at).getTime() : NaN;
      if (Number.isFinite(createdMs) && createdMs < cutoff) stale.push(`${dir}/${name}`);
    }
    if (stale.length === 0) return 0;
    const { error: rmErr } = await bucket.remove(stale);
    return rmErr ? 0 : stale.length;
  } catch {
    return 0;
  }
}

export async function createMessengerStagedUploadUrls(input: {
  sb: Sb;
  kind: MessengerStagingKind;
  userId: string;
  roomId: string;
  exts: string[];
}): Promise<{ ok: true; uploads: Array<{ path: string; signedUrl: string; token?: string }> } | { ok: false; error: string }> {
  const bucketName = await resolveMessengerMediaUploadBucket(input.sb);
  const bucket = input.sb.storage.from(bucketName);
  for (const b of new Set<MessengerMediaBucket>([bucketName, MESSENGER_LEGACY_MEDIA_BUCKET])) {
    await purgeStaleMessengerStagingObjects({
      sb: input.sb,
      kind: input.kind,
      userId: input.userId,
      roomId: input.roomId,
      bucket: b,
    });
  }
  const uploads: Array<{ path: string; signedUrl: string; token?: string }> = [];
  for (const ext of input.exts) {
    const path = buildMessengerStagingPath({
      kind: input.kind,
      userId: input.userId,
      roomId: input.roomId,
      uuid: randomUUID(),
      ext,
    });
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data?.signedUrl) return { ok: false, error: "upload_url_failed" };
    uploads.push({ path, signedUrl: data.signedUrl, ...(data.token ? { token: data.token } : {}) });
  }
  return { ok: true, uploads };
}

/** 파일 upload-url 요청 사전 검사(용량·확장자) — 바이트 검증은 finalize 단계에서 서버가 다시 수행. */
export function precheckMessengerFileUploadUrlRequest(input: {
  fileName: unknown;
  bytes: unknown;
}): { ok: true; ext: string } | { ok: false; status: number; error: string } {
  const bytes = Number(input.bytes);
  if (!Number.isInteger(bytes) || bytes <= 0) return { ok: false, status: 400, error: "file_required" };
  if (bytes > MESSENGER_FILE_UPLOAD_MAX_BYTES) return { ok: false, status: 413, error: "file_too_large" };
  const ext = deriveMessengerFileExtension(typeof input.fileName === "string" ? input.fileName : "");
  if (MESSENGER_FILE_UPLOAD_HARD_BLOCK_EXTS.has(ext) || !isMessengerFileAllowedExt(ext)) {
    return { ok: false, status: 415, error: "blocked_file_type" };
  }
  return { ok: true, ext };
}

/** 이미지 upload-urls 요청 사전 검사(장수·용량·MIME). */
export function precheckMessengerImageUploadUrlsRequest(
  items: unknown
): { ok: true; exts: string[] } | { ok: false; status: number; error: string } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, status: 400, error: "file_required" };
  if (items.length > MESSENGER_IMAGE_UPLOAD_MAX_FILES) return { ok: false, status: 400, error: "too_many_images" };
  const exts: string[] = [];
  for (const raw of items) {
    const it = (raw ?? {}) as { mime?: unknown; bytes?: unknown };
    const bytes = Number(it.bytes);
    if (!Number.isInteger(bytes) || bytes <= 0) return { ok: false, status: 400, error: "file_required" };
    if (bytes > MESSENGER_IMAGE_UPLOAD_MAX_BYTES) return { ok: false, status: 413, error: "file_too_large" };
    const mime = typeof it.mime === "string" ? it.mime.toLowerCase().trim() : "";
    const ext = MESSENGER_IMAGE_UPLOAD_ALLOWED_MIMES.has(mime) ? messengerImageStagingExtForMime(mime) : null;
    if (!ext) return { ok: false, status: 400, error: "unsupported_image" };
    exts.push(ext);
  }
  return { ok: true, exts };
}

/**
 * staged 이미지 경로 목록 → 다운로드(즉시 staging 삭제) → 실제 서명으로 MIME 판정·용량 재검사.
 * 하나라도 잘못되면 나머지 staging 도 삭제하고 거부한다.
 */
export async function collectMessengerStagedImages(input: {
  sb: Sb;
  userId: string;
  roomId: string;
  stagedPaths: unknown;
}): Promise<{ ok: true; images: MessengerImageUploadInput[] } | { ok: false; status: number; error: string }> {
  const raw = Array.isArray(input.stagedPaths) ? input.stagedPaths : [];
  const parsed = raw.map((p) =>
    parseMessengerStagedPath({ kind: "image", userId: input.userId, roomId: input.roomId, path: p })
  );
  const validPaths = parsed.flatMap((p) => (p.ok ? [p.path] : []));
  const fail = async (status: number, error: string) => {
    await removeMessengerStagedObjects(input.sb, validPaths);
    return { ok: false as const, status, error };
  };
  if (raw.length === 0) return fail(400, "file_required");
  if (raw.length > MESSENGER_IMAGE_UPLOAD_MAX_FILES) return fail(400, "too_many_images");
  if (validPaths.length !== raw.length) return fail(400, "staged_path_invalid");
  if (new Set(validPaths).size !== validPaths.length) return fail(400, "staged_path_invalid");

  const images: MessengerImageUploadInput[] = [];
  for (let i = 0; i < validPaths.length; i += 1) {
    const taken = await takeMessengerStagedObject(input.sb, validPaths[i]!);
    let failure: { status: number; error: string } | null = null;
    if (!taken.ok) failure = { status: 400, error: "upload_missing" };
    else if (taken.buf.length === 0) failure = { status: 400, error: "file_required" };
    else if (taken.buf.length > MESSENGER_IMAGE_UPLOAD_MAX_BYTES) failure = { status: 413, error: "file_too_large" };
    else {
      const mimeType = sniffMessengerImageMime(taken.buf);
      if (!mimeType || !MESSENGER_IMAGE_UPLOAD_ALLOWED_MIMES.has(mimeType)) {
        failure = { status: 400, error: "unsupported_image" };
      } else {
        images.push({ buf: taken.buf, mimeType });
      }
    }
    if (failure) {
      // 남은 staging 은 내려받지 않고 삭제만 한다(모든 결과에서 staging 잔존 금지).
      await removeMessengerStagedObjects(input.sb, validPaths.slice(i + 1));
      return { ok: false, ...failure };
    }
  }
  return { ok: true, images };
}
