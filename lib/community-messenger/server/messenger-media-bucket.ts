/**
 * C-4 — 메신저 신규 업로드 버킷 결정 (서버 전용: service-role Storage 클라이언트를 받는다).
 *
 * - `MESSENGER_PRIVATE_MEDIA_BUCKET=off|0|false` → 항상 레거시 `post-images` (긴급 롤백 스위치).
 * - 그 외(미설정 포함) → 비공개 버킷 `messenger-media` 가 **존재하고 public=false** 일 때만 사용.
 *   마이그레이션 미적용(버킷 없음)·잘못 public 으로 생성된 경우는 레거시로 남는다 → 적용 전후 모두 동작.
 * - 감지 결과는 프로세스 캐시(양성 10분 · 음성 60초). Storage API 오류는 음성으로 취급.
 */
import {
  MESSENGER_LEGACY_MEDIA_BUCKET,
  MESSENGER_PRIVATE_MEDIA_BUCKET,
  type MessengerMediaBucket,
} from "@/lib/community-messenger/media/messenger-media-ref";

export type MessengerMediaBucketProbeClient = {
  storage: {
    getBucket: (id: string) => Promise<{ data: { public?: boolean | null } | null; error: unknown }>;
  };
};

const POSITIVE_TTL_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 60_000;

let cache: { bucket: MessengerMediaBucket; at: number } | null = null;

export function messengerPrivateMediaBucketDisabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.MESSENGER_PRIVATE_MEDIA_BUCKET ?? "").trim().toLowerCase();
  return v === "off" || v === "0" || v === "false" || v === "disabled";
}

export function resetMessengerMediaBucketCacheForTests(): void {
  cache = null;
}

/** 신규 메신저 첨부(이미지·파일·음성·동영상 파일·staging)를 올릴 버킷. */
export async function resolveMessengerMediaUploadBucket(
  sb: MessengerMediaBucketProbeClient,
  opts?: { nowMs?: number; env?: NodeJS.ProcessEnv }
): Promise<MessengerMediaBucket> {
  if (messengerPrivateMediaBucketDisabledByEnv(opts?.env)) return MESSENGER_LEGACY_MEDIA_BUCKET;
  const now = opts?.nowMs ?? Date.now();
  if (cache) {
    const ttl = cache.bucket === MESSENGER_PRIVATE_MEDIA_BUCKET ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
    if (now - cache.at < ttl) return cache.bucket;
  }
  let bucket: MessengerMediaBucket = MESSENGER_LEGACY_MEDIA_BUCKET;
  try {
    const { data, error } = await sb.storage.getBucket(MESSENGER_PRIVATE_MEDIA_BUCKET);
    if (!error && data) {
      if (data.public === false) {
        bucket = MESSENGER_PRIVATE_MEDIA_BUCKET;
      } else {
        console.error("[messenger-media-bucket] private_bucket_is_public — falling back to legacy bucket");
      }
    }
  } catch {
    /* 감지 실패 → 레거시 */
  }
  cache = { bucket, at: now };
  return bucket;
}

/** 메시지 metadata 에 추가하는 신규 키 (기존 `storagePath`·URL 키는 호출부가 그대로 유지). */
export function messengerMediaStorageMetadata(
  bucket: MessengerMediaBucket,
  path: string | string[]
): Record<string, unknown> {
  return Array.isArray(path)
    ? { storage_bucket: bucket, storage_path: path[0] ?? null, storage_paths: path }
    : { storage_bucket: bucket, storage_path: path };
}
