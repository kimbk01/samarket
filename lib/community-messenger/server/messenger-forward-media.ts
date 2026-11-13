/**
 * 메시지 「전달하기」 2단계 — 사진·파일 저장 객체 복사 (통합 공유 S6-2 · Owner 2026-11-14).
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §M (T-6).
 *
 * 왜 복사인가: 원본 「모두에게서 삭제」(`softDeleteCommunityMessengerMessageForEveryone`)가
 * `purgeMessengerMediaStoragePaths` 로 저장 파일을 지운다. 전달본이 같은 파일을 가리키면 원본 삭제 때 깨진다.
 * → 원본 메시지가 가리키는 모든 객체(섬네일·미리보기·원본·앨범 전체)를 대상 방 경로로 복사하고,
 *   metadata·content 의 경로·주소를 새 객체로 바꾼다. 전달본 삭제는 그 복사본만 지운다.
 *
 * - 대상 객체 = `collectMessengerMessageMediaRefs`(조회 라우트 열람 허용 목록과 같은 함수) — 열람 검사와 일치.
 * - 새 경로 = `messengerFinalMediaDir(kind, 보낸 사람, 대상 방)/fwd-{uuid}-{원래 파일 이름}` (같은 버킷).
 *   **같은 원본에서 나온 파생본은 같은 uuid** — 업로드 규칙 `{id}.{ext}`·`{id}.thumb.webp`·`{id}.preview.webp`
 *   (messenger-image-upload-process.ts:94-105)를 복사본도 지켜야, 「모두에게서 삭제」 정리
 *   (`collectMessengerMediaStoragePaths` 의 파생 형제 규칙 `{stem}.thumb.webp`·`{stem}.preview.webp`)가 복사한 파생본까지 지운다.
 * - 하나라도 복사 실패 → 이미 복사한 것 지우고 실패.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseServer } from "@/lib/chat/supabase-server";
import {
  collectMessengerMessageMediaRefs,
  encodeMessengerMediaObjectParam,
  isSafeMessengerStorageKey,
  messengerMediaBucketFromMetadata,
  parseMessengerStorageObjectUrl,
  type MessengerMediaBucket,
  type MessengerMediaObjectRef,
} from "@/lib/community-messenger/media/messenger-media-ref";
import { purgeMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";
import { messengerFinalMediaDir } from "@/lib/community-messenger/upload/messenger-direct-upload-policy";

type Sb = SupabaseServer;

/** 전달본에 넘기지 않는 원본 metadata 키 — 중복 방지 키·답장·반응·전달 표시는 새로 정한다 */
const DROP_META_KEYS = new Set([
  "client_message_id",
  "clientMessageId",
  "forwarded",
  "reply_to_message_id",
  "replyToMessageId",
  "reactions",
]);

export type ForwardMediaCopyResult =
  | {
      ok: true;
      content: string;
      metadata: Record<string, unknown>;
      copied: MessengerMediaObjectRef[];
    }
  | { ok: false; error: string };

function baseName(path: string): string {
  const seg = path.split("/").pop() ?? "";
  const safe = seg.replace(/[^A-Za-z0-9._-]/g, "_");
  return safe || "file";
}

/** 파생본 묶음 기준 — `{id}.thumb.webp`·`{id}.preview.webp`·`{id}.{ext}` → `{id}` (디렉터리 포함) */
export function forwardMediaStemKey(ref: MessengerMediaObjectRef): string {
  const slash = ref.path.lastIndexOf("/");
  const dir = slash >= 0 ? ref.path.slice(0, slash) : "";
  const b = slash >= 0 ? ref.path.slice(slash + 1) : ref.path;
  let stem = b;
  if (b.endsWith(".thumb.webp")) stem = b.slice(0, -".thumb.webp".length);
  else if (b.endsWith(".preview.webp")) stem = b.slice(0, -".preview.webp".length);
  else {
    const dot = b.lastIndexOf(".");
    if (dot > 0) stem = b.slice(0, dot);
  }
  return `${ref.bucket}/${dir}/${stem}`;
}

export async function purgeForwardedMediaCopies(sb: Sb, copied: MessengerMediaObjectRef[], roomId: string): Promise<void> {
  const byBucket = new Map<MessengerMediaBucket, string[]>();
  for (const r of copied) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.path]);
  for (const [bucket, paths] of byBucket) {
    await purgeMessengerMediaStoragePaths(sb as never, paths, { roomId, bucket });
  }
}

export async function copyMessengerMediaForForward(
  sb: Sb,
  input: {
    userId: string;
    targetRoomId: string;
    messageType: "image" | "file";
    content: string;
    metadata: Record<string, unknown>;
  }
): Promise<ForwardMediaCopyResult> {
  const refs = collectMessengerMessageMediaRefs({ metadata: input.metadata, content: input.content });
  if (refs.length === 0) return { ok: false, error: "forward_media_missing" };

  const dir = messengerFinalMediaDir(input.messageType, input.userId, input.targetRoomId);
  const mapped = new Map<string, { ref: MessengerMediaObjectRef; url: string }>();
  const copied: MessengerMediaObjectRef[] = [];

  const stemUuid = new Map<string, string>();
  for (const ref of refs) {
    const stemKey = forwardMediaStemKey(ref);
    let uuid = stemUuid.get(stemKey);
    if (!uuid) {
      uuid = randomUUID();
      stemUuid.set(stemKey, uuid);
    }
    const newPath = `${dir}/fwd-${uuid}-${baseName(ref.path)}`;
    if (!isSafeMessengerStorageKey(newPath)) {
      await purgeForwardedMediaCopies(sb, copied, input.targetRoomId);
      return { ok: false, error: "forward_media_copy_failed" };
    }
    const bucket = sb.storage.from(ref.bucket);
    const { error } = await bucket.copy(ref.path, newPath);
    if (error) {
      console.error("[cm_forward] media_copy_failed", { bucket: ref.bucket, message: error.message });
      await purgeForwardedMediaCopies(sb, copied, input.targetRoomId);
      return { ok: false, error: "forward_media_copy_failed" };
    }
    const next = { bucket: ref.bucket, path: newPath };
    copied.push(next);
    mapped.set(encodeMessengerMediaObjectParam(ref), { ref: next, url: bucket.getPublicUrl(newPath).data.publicUrl });
  }

  const keyBucket = messengerMediaBucketFromMetadata(input.metadata);
  const remap = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(remap);
    if (typeof v !== "string") return v;
    const asKey = mapped.get(encodeMessengerMediaObjectParam({ bucket: keyBucket, path: v }));
    if (asKey) return asKey.ref.path;
    const asUrl = parseMessengerStorageObjectUrl(v);
    if (asUrl) {
      const hit = mapped.get(encodeMessengerMediaObjectParam(asUrl));
      if (hit) return hit.url;
    }
    return v;
  };

  const metadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.metadata ?? {})) {
    if (DROP_META_KEYS.has(k)) continue;
    metadata[k] = remap(v);
  }
  const content = String(remap(input.content) ?? "");
  return { ok: true, content, metadata, copied };
}
