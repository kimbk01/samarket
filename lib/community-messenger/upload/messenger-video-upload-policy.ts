/**
 * 채팅 영상 보내기 — 정책 단일 정의(SSOT). 클라이언트·서버·네이티브 호출부가 이 값만 쓴다.
 * 설계: `docs/audit/messenger-video-send-audit-design-2026-11-24.md` (Owner 2026-11-24 「제안값대로 승인」 O1~O7)
 *
 * 순수 모듈 — Node 전용 API 를 쓰지 않는다.
 */

/** O1: 최대 길이 3분 */
export const MESSENGER_VIDEO_MAX_DURATION_MS = 3 * 60 * 1000;
/** O1·O4: 1개 최대 바이트 — 버킷 `messenger-media` 한도 50MB 와 같다(버킷 설정 변경 없음). */
export const MESSENGER_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** O1: 압축 목표 — 긴 변 1280px(720p) · 영상 약 2Mbps · 음성 128kbps · H.264/AAC mp4 */
export const MESSENGER_VIDEO_TRANSCODE_TARGET = {
  maxLongEdgePx: 1280,
  videoBitrate: 2_000_000,
  audioBitrate: 128_000,
  container: "mp4",
} as const;

/** 썸네일 — JPEG, 긴 변 최대 480px, 최대 512KB */
export const MESSENGER_VIDEO_THUMB_MAX_LONG_EDGE_PX = 480;
export const MESSENGER_VIDEO_THUMB_MAX_BYTES = 512 * 1024;
export const MESSENGER_VIDEO_THUMB_EXT = "jpg";
export const MESSENGER_VIDEO_THUMB_CONTENT_TYPE = "image/jpeg";

/** 웹 대체 경로(구 바이너리·브라우저) `<input accept>` — 압축 없이 mp4·mov 만 */
export const MESSENGER_VIDEO_WEB_ACCEPT = "video/mp4,video/quicktime,.mp4,.mov";

/** 허용 컨테이너(확장자 → 저장 contentType). 둘 다 ISO-BMFF(`ftyp`) 서명. */
export const MESSENGER_VIDEO_CONTAINERS = {
  mp4: "video/mp4",
  mov: "video/quicktime",
} as const;
export type MessengerVideoExt = keyof typeof MESSENGER_VIDEO_CONTAINERS;

export function isMessengerVideoExt(v: unknown): v is MessengerVideoExt {
  return v === "mp4" || v === "mov";
}

/** 파일명·MIME → 저장 확장자. 허용 밖이면 null. */
export function messengerVideoExtFor(input: { name?: string | null; mime?: string | null }): MessengerVideoExt | null {
  const mime = String(input.mime ?? "").toLowerCase().trim();
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  const name = String(input.name ?? "").toLowerCase().trim();
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1) : "";
  if (ext === "mp4" || ext === "m4v") return "mp4";
  if (ext === "mov") return "mov";
  return null;
}

/** 표시 크기 — 양의 정수, 상한 10000. */
export function messengerVideoDimension(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 10_000 ? n : null;
}

export type MessengerVideoPrecheckError = "video_too_large" | "video_too_long" | "unsupported_video" | "empty_file";

/**
 * 업로드 전 검사 — 크기·길이·형식. 클라이언트(선택 시)와 서버(upload-url·확정) 가 같은 함수를 쓴다.
 * durationMs 를 모르면(null) 길이 검사는 서버 확정 단계의 클라이언트 보고값으로 다시 한다.
 */
export function precheckMessengerVideo(input: {
  bytes: number;
  durationMs: number | null;
  ext: string | null;
}): { ok: true; ext: MessengerVideoExt } | { ok: false; error: MessengerVideoPrecheckError } {
  const bytes = Number(input.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: "empty_file" };
  if (!isMessengerVideoExt(input.ext)) return { ok: false, error: "unsupported_video" };
  if (bytes > MESSENGER_VIDEO_MAX_BYTES) return { ok: false, error: "video_too_large" };
  if (input.durationMs != null) {
    const d = Number(input.durationMs);
    if (!Number.isFinite(d) || d <= 0) return { ok: false, error: "unsupported_video" };
    /* 컨테이너 반올림 여유 500ms */
    if (d > MESSENGER_VIDEO_MAX_DURATION_MS + 500) return { ok: false, error: "video_too_long" };
  }
  return { ok: true, ext: input.ext };
}

/** ISO-BMFF(mp4·mov) 서명 — 4..8 바이트가 `ftyp` */
export function isMessengerVideoSignature(head: Uint8Array): boolean {
  return head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

/** JPEG 서명 */
export function isMessengerJpegSignature(head: Uint8Array): boolean {
  return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

/** 길이 표시 `m:ss` (1시간 이상 `h:mm:ss`) */
export function formatMessengerVideoDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 저장 경로 — `{userId}/community/messenger-video/{roomId}/{uuid}.{ext}` · 썸네일 `{uuid}.thumb.jpg` */
export const MESSENGER_VIDEO_FINAL_SEGMENT = "messenger-video";

export function messengerVideoDir(userId: string, roomId: string): string {
  return `${userId}/community/${MESSENGER_VIDEO_FINAL_SEGMENT}/${roomId}`;
}

export function buildMessengerVideoPaths(input: { userId: string; roomId: string; uuid: string; ext: MessengerVideoExt }): {
  videoPath: string;
  thumbPath: string;
} {
  const dir = messengerVideoDir(input.userId, input.roomId);
  return {
    videoPath: `${dir}/${input.uuid}.${input.ext}`,
    thumbPath: `${dir}/${input.uuid}.thumb.${MESSENGER_VIDEO_THUMB_EXT}`,
  };
}

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * 클라이언트가 돌려준 영상 경로를 엄격히 검증 — 본인·이 방·`messenger-video` 바로 아래 `{uuid}.{mp4|mov}` 만.
 * 썸네일 경로는 같은 uuid 로 서버가 다시 만든다(클라 입력 신뢰 안 함).
 */
export function parseMessengerVideoPath(input: {
  userId: string;
  roomId: string;
  path: unknown;
}): { ok: true; videoPath: string; thumbPath: string; uuid: string; ext: MessengerVideoExt } | { ok: false } {
  if (typeof input.path !== "string") return { ok: false };
  const userId = String(input.userId ?? "").trim();
  const roomId = String(input.roomId ?? "").trim();
  if (!userId || !roomId || /[/\\]/.test(userId) || /[/\\]/.test(roomId)) return { ok: false };
  const prefix = `${messengerVideoDir(userId, roomId)}/`;
  const path = input.path;
  if (path.length > 512 || !path.startsWith(prefix)) return { ok: false };
  const m = new RegExp(`^(${UUID_RE})\\.(mp4|mov)$`).exec(path.slice(prefix.length));
  if (!m) return { ok: false };
  const ext = m[2] as MessengerVideoExt;
  const paths = buildMessengerVideoPaths({ userId, roomId, uuid: m[1]!, ext });
  return { ok: true, ...paths, uuid: m[1]!, ext };
}

/** GC: 메시지 없이 이 시간이 지난 `messenger-video/` 객체는 버려진 업로드 */
export const MESSENGER_VIDEO_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
