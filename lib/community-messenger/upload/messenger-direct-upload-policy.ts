/**
 * D-3 — 메신저 이미지·파일 업로드 전송 방식(transport) 단일 정의.
 *
 * Vercel 서버리스 함수 요청 본문 한도(~4.5MB)를 넘는 multipart 는 함수에 도달하기 전에 413(비 JSON)으로
 * 잘린다. 그래서 큰 업로드는 **staged direct upload** 로 보낸다(선례: `lib/launch-intro/server.ts`
 * createLaunchIntroDraftUpload / finalizeLaunchIntroDraftUpload):
 *   1) `POST …/files/upload-url` · `POST …/images/upload-urls` → 서버가 staging 경로에 서명 업로드 URL 발급
 *   2) 클라이언트가 Supabase Storage 로 바이트를 직접 PUT(함수 본문 한도 없음)
 *   3) `POST …/files` · `POST …/images` 에 JSON `{ stagedPath(s), clientMessageId }` → 서버가 staging 객체를
 *      내려받아 multipart 와 **같은** 검증·가공·전송 파이프라인을 실행하고 staging 은 항상 삭제한다.
 *
 * 이 모듈은 클라이언트·서버 공용 **순수** 상수/헬퍼(Node API 없음).
 */
import { MESSENGER_FILE_UPLOAD_MAX_BYTES } from "@/lib/community-messenger/upload/messenger-file-upload-policy";

/**
 * multipart 로 보낼 수 있는 요청 전체 바이트 상한(안전 여유).
 * Vercel 함수 요청 본문 한도 4.5MB − multipart 경계·헤더·필드 오버헤드 여유 ≈ 3.5MB.
 * 이 값 이하만 기존 multipart 경로(구 앱 바이너리와 동일 계약), 초과는 staged direct upload.
 */
export const MESSENGER_MULTIPART_SAFE_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);

/** 이미지 1장 상한 — `images/route` 의 기존 MAX_BYTES 와 동일 */
export const MESSENGER_IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
/** 이미지 앨범 최대 장수 — `images/route` 의 기존 MAX_FILES 와 동일 */
export const MESSENGER_IMAGE_UPLOAD_MAX_FILES = 10;
/** 허용 이미지 MIME — `images/route` 의 기존 ALLOWED 와 동일 */
export const MESSENGER_IMAGE_UPLOAD_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export { MESSENGER_FILE_UPLOAD_MAX_BYTES };

export type MessengerUploadTransport = "multipart" | "staged";

/** multipart 필드·경계 오버헤드 추정(파일당) — 보수적 */
const MULTIPART_PER_PART_OVERHEAD_BYTES = 1024;

/**
 * 전송 방식 결정 — 파일 바이트 합 + multipart 오버헤드가 안전 상한 이하면 multipart, 아니면 staged.
 */
export function decideMessengerUploadTransport(fileSizes: readonly number[]): MessengerUploadTransport {
  let total = 0;
  for (const size of fileSizes) {
    const n = Number(size);
    total += (Number.isFinite(n) && n > 0 ? n : 0) + MULTIPART_PER_PART_OVERHEAD_BYTES;
  }
  return total <= MESSENGER_MULTIPART_SAFE_MAX_BYTES ? "multipart" : "staged";
}

export type MessengerStagingKind = "file" | "image";

const STAGING_SEGMENT: Record<MessengerStagingKind, string> = {
  file: "messenger-file-staging",
  image: "messenger-image-staging",
};

const FINAL_SEGMENT: Record<MessengerStagingKind, string> = {
  file: "messenger-file",
  image: "messenger-image",
};

/** UUID v1–v8(소문자/대문자 hex) */
const UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const EXT_RE = "[a-z0-9]{1,10}";

function isSafePathSegment(v: string): boolean {
  return v.length > 0 && v.length <= 128 && !v.includes("/") && !v.includes("\\") && v !== "." && v !== "..";
}

/** `${userId}/community/messenger-{kind}-staging/${roomId}` — 서버만 경로를 발급한다. */
export function messengerStagingDir(kind: MessengerStagingKind, userId: string, roomId: string): string {
  return `${userId}/community/${STAGING_SEGMENT[kind]}/${roomId}`;
}

/** 최종 저장 디렉터리 — 기존 multipart 라우트와 같은 규칙 */
export function messengerFinalMediaDir(kind: MessengerStagingKind, userId: string, roomId: string): string {
  return `${userId}/community/${FINAL_SEGMENT[kind]}/${roomId}`;
}

export function buildMessengerStagingPath(input: {
  kind: MessengerStagingKind;
  userId: string;
  roomId: string;
  uuid: string;
  ext: string;
}): string {
  return `${messengerStagingDir(input.kind, input.userId, input.roomId)}/${input.uuid}.${input.ext}`;
}

export type ParsedMessengerStagedPath = { ok: true; path: string; uuid: string; ext: string } | { ok: false };

/**
 * 클라이언트가 돌려준 staged 경로를 **엄격히** 검증한다 — 본인(userId)·이 방(roomId)·해당 종류의 staging
 * 디렉터리 바로 아래 `{uuid}.{ext}` 만 허용(다른 사용자/방/상위 경로 탈출/중첩 경로/쿼리 거부).
 */
export function parseMessengerStagedPath(input: {
  kind: MessengerStagingKind;
  userId: string;
  roomId: string;
  path: unknown;
}): ParsedMessengerStagedPath {
  if (typeof input.path !== "string") return { ok: false };
  const path = input.path;
  const userId = String(input.userId ?? "").trim();
  const roomId = String(input.roomId ?? "").trim();
  if (!isSafePathSegment(userId) || !isSafePathSegment(roomId)) return { ok: false };
  if (path.length > 512 || path.includes("..") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    return { ok: false };
  }
  const prefix = `${messengerStagingDir(input.kind, userId, roomId)}/`;
  if (!path.startsWith(prefix)) return { ok: false };
  const leaf = path.slice(prefix.length);
  const m = new RegExp(`^(${UUID_RE})\\.(${EXT_RE})$`).exec(leaf);
  if (!m) return { ok: false };
  return { ok: true, path, uuid: m[1]!.toLowerCase(), ext: m[2]! };
}

/** 이미지 MIME → staging 확장자(서버 가공 단계에서 실제 서명으로 다시 판정) */
export function messengerImageStagingExtForMime(mime: string): string | null {
  const m = String(mime ?? "").toLowerCase().trim();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return null;
}

/**
 * 전송 실패 분류 — 서버 커밋 여부를 **알 수 없는** 실패(네트워크 예외·타임아웃·5xx·본문 유실)는
 * `indeterminate`(같은 clientMessageId 로 재전송해야 서버 UNIQUE 멱등으로 1행만 남는다),
 * 서버가 명시적으로 거절한 4xx(또는 2xx + ok:false)는 `definitive`(cid 폐기·새 전송은 새 cid).
 */
export type MessengerSendFailureKind = "definitive" | "indeterminate";

export function classifyMessengerSendFailure(input: {
  /** fetch 예외(오프라인·연결 끊김·abort) */
  networkError?: boolean;
  /** HTTP status — 없으면 networkError 와 동일 취급 */
  status?: number | null;
  /** 응답 JSON 이 파싱되었는지(2xx 인데 본문 유실이면 indeterminate) */
  jsonParsed?: boolean;
}): MessengerSendFailureKind {
  if (input.networkError) return "indeterminate";
  const status = Number(input.status ?? 0);
  if (!Number.isFinite(status) || status <= 0) return "indeterminate";
  /** 408 Request Timeout · 425 Too Early — 서버 처리 여부 불명 */
  if (status === 408 || status === 425) return "indeterminate";
  if (status >= 500) return "indeterminate";
  if (status >= 400) return "definitive";
  /** 2xx/3xx 인데 ok 가 아님: 본문이 있으면 서버 판단(거절), 본문 유실이면 불명 */
  return input.jsonParsed === false ? "indeterminate" : "definitive";
}

/**
 * Vercel 413(비 JSON)·HTML 오류 페이지 등 본문에 `error` 가 없을 때 사용자 문구용 오류 코드.
 */
export function messengerUploadFallbackErrorCode(status: number | null | undefined): string {
  const s = Number(status ?? 0);
  if (s === 413) return "file_too_large";
  if (s === 415) return "unsupported_file";
  return "upload_failed";
}
