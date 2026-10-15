/**
 * 메신저 파일 업로드 — 서버(`files/route` · `validate-messenger-file-upload`)와 클라이언트(사전 검사·`accept`)
 * 가 공유하는 **순수** 정책 상수·헬퍼. Node 전용 API(Buffer 등)를 쓰지 않는다.
 *
 * 허용 목록·용량은 여기 한 곳에서만 정의한다(서버 검증기가 이 목록을 키로 강제).
 */

/** 서버 `files/route` 의 업로드 상한과 동일 (15MB) */
export const MESSENGER_FILE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

/** 허용 확장자 (NEW-07 정책: pdf·txt·csv·zip·office·hwp·jpg·png·webp·mp4·m4a) */
export const MESSENGER_FILE_UPLOAD_ALLOWED_EXTS = [
  "pdf",
  "txt",
  "csv",
  "zip",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "hwp",
  "hwpx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp4",
  "m4a",
] as const;

export type MessengerFileAllowedExt = (typeof MESSENGER_FILE_UPLOAD_ALLOWED_EXTS)[number];

/** 이름을 바꿔도 항상 거절해야 하는 확장자 */
export const MESSENGER_FILE_UPLOAD_HARD_BLOCK_EXTS: ReadonlySet<string> = new Set([
  "html", "htm", "xhtml", "svg", "js", "mjs", "cjs", "apk", "jar", "exe", "bat", "cmd", "sh",
  "php", "phtml", "jsp", "asp", "aspx", "dll", "so", "msi", "scr", "com", "vbs", "ps1",
]);

/** `<input type="file" accept>` 값 — 허용 확장자 목록에서 파생 */
export const MESSENGER_FILE_UPLOAD_ACCEPT = MESSENGER_FILE_UPLOAD_ALLOWED_EXTS.map((e) => `.${e}`).join(",");

const ALLOWED_EXT_SET: ReadonlySet<string> = new Set(MESSENGER_FILE_UPLOAD_ALLOWED_EXTS);

export function isMessengerFileAllowedExt(ext: string): ext is MessengerFileAllowedExt {
  return ALLOWED_EXT_SET.has(ext);
}

const DISPLAY_NAME_MAX_CHARS = 200;

/** 제어문자 + 방향 제어(파일명 스푸핑: `exe‮fdp.pdf`) 문자 */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * 표시용 원본 파일명 정리 — 한글 등 유니코드는 보존한다.
 * NFC 정규화(macOS/iOS NFD 자모 분리 방지) → 경로 구성요소 제거(마지막 `/`·`\` 뒤만) →
 * 제어·방향 제어 문자 제거 → trim → 최대 200자(확장자 보존). 비면 `"file"`.
 */
export function sanitizeMessengerFileDisplayName(raw: string | null | undefined): string {
  let name = String(raw ?? "");
  try {
    name = name.normalize("NFC");
  } catch {
    /* ignore */
  }
  name = name.replace(UNSAFE_NAME_CHARS, "");
  const lastSep = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  if (lastSep >= 0) name = name.slice(lastSep + 1);
  name = name.trim();
  if (!name || /^\.+$/.test(name)) return "file";

  const chars = Array.from(name);
  if (chars.length > DISPLAY_NAME_MAX_CHARS) {
    const dot = name.lastIndexOf(".");
    const extPart = dot > 0 ? Array.from(name.slice(dot)) : [];
    if (extPart.length > 0 && extPart.length <= 11) {
      const stem = Array.from(name.slice(0, dot)).slice(0, DISPLAY_NAME_MAX_CHARS - extPart.length);
      name = (stem.join("").trimEnd() + extPart.join("")).trim();
    } else {
      name = chars.slice(0, DISPLAY_NAME_MAX_CHARS).join("").trim();
    }
  }
  return name || "file";
}

/**
 * 저장 키용 확장자 — 원본 파일명의 마지막 `.` 뒤, 소문자, `[a-z0-9]{1,10}` 만 허용. 아니면 `"bin"`.
 */
export function deriveMessengerFileExtension(raw: string | null | undefined): string {
  const name = sanitizeMessengerFileDisplayName(raw);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "bin";
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}

export type MessengerFilePrecheckResult =
  | { ok: true; ext: MessengerFileAllowedExt; displayName: string }
  | { ok: false; error: "file_too_large" | "blocked_file_type" | "empty_file" };

/**
 * 클라이언트 업로드 전 사전 검사 — 서버와 같은 용량·확장자 정책. (MIME·서명 검사는 서버만 수행)
 */
export function precheckMessengerFileForUpload(file: { name?: string | null; size: number }): MessengerFilePrecheckResult {
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "empty_file" };
  if (file.size > MESSENGER_FILE_UPLOAD_MAX_BYTES) return { ok: false, error: "file_too_large" };
  const displayName = sanitizeMessengerFileDisplayName(file.name);
  const ext = deriveMessengerFileExtension(displayName);
  if (MESSENGER_FILE_UPLOAD_HARD_BLOCK_EXTS.has(ext) || !isMessengerFileAllowedExt(ext)) {
    return { ok: false, error: "blocked_file_type" };
  }
  return { ok: true, ext, displayName };
}
