/**
 * C-4 (O-C3) — 메신저 첨부 저장소 참조·조회 라우트 URL 단일 정의 (client-safe · 순수 함수).
 *
 * - 신규 업로드: 비공개 버킷 `messenger-media` (마이그레이션 적용 + 서버 감지 시). 메시지 metadata 에
 *   `storage_bucket`/`storage_path` 를 함께 기록하고, 기존 키(URL·storagePath)는 호환용으로 유지한다.
 * - 레거시: 공개 버킷 `post-images` — 파일 이동 없음. 새로 그리는 링크는 모두 조회 라우트를 거친다.
 * - 조회: `GET /api/community-messenger/rooms/{roomId}/messages/{messageId}/media?o={bucket}/{path}`
 *   → 참가자(또는 `chats` 권한 관리자 + 감사) 확인 후 짧은 서명 URL 로 302.
 *
 * 이 파일은 서버 전용 모듈을 import 하지 않는다(클라이언트 컴포넌트·관리자 헬퍼 공용).
 */

export const MESSENGER_PRIVATE_MEDIA_BUCKET = "messenger-media" as const;
export const MESSENGER_LEGACY_MEDIA_BUCKET = "post-images" as const;
export const MESSENGER_MEDIA_BUCKETS = [MESSENGER_PRIVATE_MEDIA_BUCKET, MESSENGER_LEGACY_MEDIA_BUCKET] as const;
export type MessengerMediaBucket = (typeof MESSENGER_MEDIA_BUCKETS)[number];

export type MessengerMediaObjectRef = { bucket: MessengerMediaBucket; path: string };

/** 조회 라우트 쿼리 키 — `o`(bucket/path) · `download`(첨부 파일명) · `ctx=admin`(관리자 열람·감사) · `format=json`. */
export const MESSENGER_MEDIA_ROUTE_QUERY = {
  object: "o",
  download: "download",
  ctx: "ctx",
  format: "format",
} as const;

export function isMessengerMediaBucket(v: unknown): v is MessengerMediaBucket {
  return v === MESSENGER_PRIVATE_MEDIA_BUCKET || v === MESSENGER_LEGACY_MEDIA_BUCKET;
}

/** 버킷 내부 키로서 안전한지 — 스킴/호스트·절대경로·상위경로 탈출·제어문자 금지. */
export function isSafeMessengerStorageKey(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const p = path.trim();
  if (!p || p !== path || p.length > 1024) return false;
  if (p.includes("://") || p.startsWith("/") || p.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(p)) return false;
  if (p.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) return false;
  return true;
}

const STORAGE_OBJECT_PATH_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;

/** Supabase Storage 객체 URL(public·sign·authenticated) → 메신저 버킷 참조. 그 외 URL·버킷은 null. */
export function parseMessengerStorageObjectUrl(url: unknown): MessengerMediaObjectRef | null {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const m = STORAGE_OBJECT_PATH_RE.exec(u.pathname);
  if (!m) return null;
  const bucket = m[1]!;
  if (!isMessengerMediaBucket(bucket)) return null;
  let path: string;
  try {
    path = decodeURIComponent(m[2]!);
  } catch {
    return null;
  }
  return isSafeMessengerStorageKey(path) ? { bucket, path } : null;
}

export function encodeMessengerMediaObjectParam(ref: MessengerMediaObjectRef): string {
  return `${ref.bucket}/${ref.path}`;
}

export function decodeMessengerMediaObjectParam(v: unknown): MessengerMediaObjectRef | null {
  const raw = typeof v === "string" ? v : "";
  const slash = raw.indexOf("/");
  if (slash <= 0) return null;
  const bucket = raw.slice(0, slash);
  const path = raw.slice(slash + 1);
  if (!isMessengerMediaBucket(bucket) || !isSafeMessengerStorageKey(path)) return null;
  return { bucket, path };
}

/** metadata.storage_bucket — 없거나 알 수 없으면 레거시(post-images). */
export function messengerMediaBucketFromMetadata(metadata: Record<string, unknown> | null | undefined): MessengerMediaBucket {
  const b = metadata ? (metadata as { storage_bucket?: unknown }).storage_bucket : undefined;
  return b === MESSENGER_PRIVATE_MEDIA_BUCKET ? MESSENGER_PRIVATE_MEDIA_BUCKET : MESSENGER_LEGACY_MEDIA_BUCKET;
}

const MEDIA_URL_META_KEYS = [
  "image_thumb_url",
  "image_preview_url",
  "image_original_url",
  "imagePreviewUrl",
  "imageOriginalUrl",
  "imageUrl",
  "image_url",
  "fileUrl",
  "file_url",
  "url",
] as const;
const MEDIA_URL_ARRAY_META_KEYS = [
  "image_thumb_urls",
  "image_preview_urls",
  "image_urls",
  "imageThumbUrls",
  "imagePreviewUrls",
  "imageUrls",
] as const;

/**
 * 메시지 행(서버 기록 metadata·content)이 가리키는 모든 저장 객체.
 * 조회 라우트는 요청 객체가 **이 목록 안에 있을 때만** 서명 URL 을 발급한다(임의 경로 열람 차단).
 */
export function collectMessengerMessageMediaRefs(input: {
  metadata?: Record<string, unknown> | null;
  content?: string | null;
}): MessengerMediaObjectRef[] {
  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  const out = new Map<string, MessengerMediaObjectRef>();
  const addRef = (ref: MessengerMediaObjectRef | null) => {
    if (ref) out.set(encodeMessengerMediaObjectParam(ref), ref);
  };
  const keyBucket = messengerMediaBucketFromMetadata(meta);
  const addKey = (v: unknown) => {
    if (isSafeMessengerStorageKey(v)) addRef({ bucket: keyBucket, path: v });
  };
  addKey(meta.storage_path);
  addKey(meta.storagePath);
  for (const k of ["storage_paths", "storagePaths"] as const) {
    const arr = meta[k];
    if (Array.isArray(arr)) for (const p of arr) addKey(p);
  }
  addRef(parseMessengerStorageObjectUrl(input.content));
  for (const k of MEDIA_URL_META_KEYS) addRef(parseMessengerStorageObjectUrl(meta[k]));
  for (const k of MEDIA_URL_ARRAY_META_KEYS) {
    const arr = meta[k];
    if (Array.isArray(arr)) for (const u of arr) addRef(parseMessengerStorageObjectUrl(u));
  }
  return [...out.values()];
}

export function messengerMessageReferencesMediaObject(
  input: { metadata?: Record<string, unknown> | null; content?: string | null },
  ref: MessengerMediaObjectRef
): boolean {
  return collectMessengerMessageMediaRefs(input).some((r) => r.bucket === ref.bucket && r.path === ref.path);
}

/** 조회 라우트 경로(상대 URL — 같은 오리진 쿠키 인증). */
export function buildMessengerMediaRoutePath(input: {
  roomId: string;
  messageId: string;
  object: MessengerMediaObjectRef;
  download?: string | null;
  admin?: boolean;
}): string {
  const q = new URLSearchParams();
  q.set(MESSENGER_MEDIA_ROUTE_QUERY.object, encodeMessengerMediaObjectParam(input.object));
  const dl = String(input.download ?? "").trim();
  if (dl) q.set(MESSENGER_MEDIA_ROUTE_QUERY.download, dl);
  if (input.admin) q.set(MESSENGER_MEDIA_ROUTE_QUERY.ctx, "admin");
  return `/api/community-messenger/rooms/${encodeURIComponent(input.roomId.trim())}/messages/${encodeURIComponent(
    input.messageId.trim()
  )}/media?${q.toString()}`;
}

const MEDIA_ROUTE_RE = /^(?:https?:\/\/[^/?#]+)?\/api\/community-messenger\/rooms\/[^/?#]+\/messages\/[^/?#]+\/media\?/i;

export function isMessengerMediaRouteUrl(u: unknown): u is string {
  return typeof u === "string" && MEDIA_ROUTE_RE.test(u.trim());
}

/** 조회 라우트 URL 에 `download=<파일명>` 을 붙인다(기존 값 교체). 라우트 URL 이 아니면 null. */
export function withMessengerMediaRouteDownload(routeUrl: string, fileName: string | null | undefined): string | null {
  if (!isMessengerMediaRouteUrl(routeUrl)) return null;
  const raw = routeUrl.trim();
  const qi = raw.indexOf("?");
  const q = new URLSearchParams(raw.slice(qi + 1));
  const name = String(fileName ?? "").trim();
  if (name) q.set(MESSENGER_MEDIA_ROUTE_QUERY.download, name);
  else q.delete(MESSENGER_MEDIA_ROUTE_QUERY.download);
  return `${raw.slice(0, qi)}?${q.toString()}`;
}

function isPendingMessageId(id: string): boolean {
  return !id || id.startsWith("pending:") || id.startsWith("temp") || id.startsWith("local:");
}

/**
 * 표시용 첨부 src — 메신저 버킷 저장 URL 이면 조회 라우트로 바꾸고, 그 외(blob:/data:/외부·스티커 등)는 그대로.
 * 이미 라우트 URL 이면 그대로(멱등).
 */
export function messengerMediaRouteUrlFor(input: {
  roomId: string | null | undefined;
  messageId: string | null | undefined;
  src: string | null | undefined;
  download?: string | null;
  admin?: boolean;
}): string {
  const src = String(input.src ?? "").trim();
  if (!src || isMessengerMediaRouteUrl(src)) return src;
  const ref = parseMessengerStorageObjectUrl(src);
  if (!ref) return src;
  const roomId = String(input.roomId ?? "").trim();
  const messageId = String(input.messageId ?? "").trim();
  if (!roomId || isPendingMessageId(messageId)) return src;
  return buildMessengerMediaRoutePath({ roomId, messageId, object: ref, download: input.download, admin: input.admin });
}

type MediaMessageLike = {
  id: string;
  roomId: string;
  messageType: string;
  content: string;
  pending?: boolean;
  imagePreviewUrl?: string | null;
  imageOriginalUrl?: string | null;
  imageAlbumUrls?: string[] | null;
  imageAlbumPreviewUrls?: string[] | null;
  imageAlbumOriginalUrls?: string[] | null;
};

const projectionCache = new WeakMap<object, unknown>();

/**
 * 메시지의 첨부 표시 URL 필드(content·이미지 단일/앨범)를 조회 라우트로 투영한 사본.
 * 바뀐 것이 없으면 **같은 객체**를 돌려준다(memo·가상화 행 정체성 유지). 이미지·파일만 대상.
 */
export function withMessengerMediaRouteUrls<T extends MediaMessageLike>(m: T): T {
  if (!m || m.pending || (m.messageType !== "image" && m.messageType !== "file")) return m;
  const cached = projectionCache.get(m);
  if (cached) return cached as T;
  const map = (u: string | null | undefined) =>
    typeof u === "string" ? messengerMediaRouteUrlFor({ roomId: m.roomId, messageId: m.id, src: u }) : u;
  const mapArr = (arr: string[] | null | undefined) => (Array.isArray(arr) ? arr.map((u) => map(u) as string) : arr);
  const next: T = {
    ...m,
    content: map(m.content) as string,
    ...(m.imagePreviewUrl !== undefined ? { imagePreviewUrl: map(m.imagePreviewUrl) } : {}),
    ...(m.imageOriginalUrl !== undefined ? { imageOriginalUrl: map(m.imageOriginalUrl) } : {}),
    ...(m.imageAlbumUrls !== undefined ? { imageAlbumUrls: mapArr(m.imageAlbumUrls) } : {}),
    ...(m.imageAlbumPreviewUrls !== undefined ? { imageAlbumPreviewUrls: mapArr(m.imageAlbumPreviewUrls) } : {}),
    ...(m.imageAlbumOriginalUrls !== undefined ? { imageAlbumOriginalUrls: mapArr(m.imageAlbumOriginalUrls) } : {}),
  };
  const same =
    next.content === m.content &&
    next.imagePreviewUrl === m.imagePreviewUrl &&
    next.imageOriginalUrl === m.imageOriginalUrl &&
    sameArr(next.imageAlbumUrls, m.imageAlbumUrls) &&
    sameArr(next.imageAlbumPreviewUrls, m.imageAlbumPreviewUrls) &&
    sameArr(next.imageAlbumOriginalUrls, m.imageAlbumOriginalUrls);
  const result = same ? m : next;
  projectionCache.set(m, result);
  return result;
}

function sameArr(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
