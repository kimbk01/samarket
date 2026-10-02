/**
 * WP-6 / NEW-07 — 메신저 파일 업로드 타입 안전 검증.
 *
 * 과거: files/route 가 브라우저가 보낸 MIME 을 그대로 공개 버킷에 저장 →
 * html·svg·js·apk 등 실행/스크립트 파일을 공개 URL 로 배포(저장 XSS·멀웨어) 가능.
 *
 * 정책(설계 NEW-07): 허용 목록(pdf·txt·csv·zip·office·hwp·jpg·png·webp·mp4·m4a)만,
 * 확장자·MIME·파일 서명(magic bytes)이 **모두** 맞아야 통과. 저장 contentType 은
 * 브라우저 값이 아닌 **정규 안전 타입**으로 고정한다(폴리글랏 방어).
 */

export type MessengerFileValidationResult =
  | { ok: true; canonicalContentType: string; ext: string }
  | { ok: false; error: "blocked_file_type" | "file_type_mismatch" | "empty_file" };

type AllowEntry = {
  mimes: string[];
  canonicalContentType: string;
  /** magic-byte matcher; undefined = no binary signature (text types) */
  magic?: (b: Buffer) => boolean;
};

function startsWith(b: Buffer, bytes: number[], offset = 0): boolean {
  if (b.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (b[offset + i] !== bytes[i]) return false;
  }
  return true;
}

const SIG = {
  pdf: (b: Buffer) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  zip: (b: Buffer) =>
    startsWith(b, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || // empty archive
    startsWith(b, [0x50, 0x4b, 0x07, 0x08]), // spanned
  ole: (b: Buffer) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), // legacy office/hwp v5
  jpg: (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]),
  png: (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: (b: Buffer) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8), // RIFF….WEBP
  isoBmff: (b: Buffer) => b.length >= 12 && startsWith(b, [0x66, 0x74, 0x79, 0x70], 4), // ….ftyp (mp4/m4a)
};

/** text types: no binary magic, but must NOT begin with markup/script that a browser could execute. */
function isSafeTextStart(b: Buffer): boolean {
  if (b.length === 0) return false;
  // reject if contains a null byte in the first 512 bytes (binary disguised as text)
  const head = b.subarray(0, Math.min(b.length, 512));
  if (head.includes(0x00)) return false;
  // reject leading markup/script signatures (BOM-tolerant)
  let s = head.toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase();
  if (
    s.startsWith("<!doctype") ||
    s.startsWith("<html") ||
    s.startsWith("<svg") ||
    s.startsWith("<?xml") ||
    s.startsWith("<script") ||
    s.startsWith("<?php")
  ) {
    return false;
  }
  return true;
}

const ALLOW: Record<string, AllowEntry> = {
  pdf: { mimes: ["application/pdf"], canonicalContentType: "application/pdf", magic: SIG.pdf },
  txt: { mimes: ["text/plain"], canonicalContentType: "text/plain; charset=utf-8" },
  csv: {
    mimes: ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
    canonicalContentType: "text/csv; charset=utf-8",
  },
  zip: {
    mimes: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
    canonicalContentType: "application/zip",
    magic: SIG.zip,
  },
  // office (modern = zip/OOXML, legacy = OLE)
  doc: { mimes: ["application/msword"], canonicalContentType: "application/msword", magic: SIG.ole },
  docx: {
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
    canonicalContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: SIG.zip,
  },
  xls: { mimes: ["application/vnd.ms-excel"], canonicalContentType: "application/vnd.ms-excel", magic: SIG.ole },
  xlsx: {
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
    canonicalContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: SIG.zip,
  },
  ppt: { mimes: ["application/vnd.ms-powerpoint"], canonicalContentType: "application/vnd.ms-powerpoint", magic: SIG.ole },
  pptx: {
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream"],
    canonicalContentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    magic: SIG.zip,
  },
  // hwp (v5 = OLE, hwpx = zip)
  hwp: {
    mimes: ["application/x-hwp", "application/haansofthwp", "application/octet-stream"],
    canonicalContentType: "application/x-hwp",
    magic: SIG.ole,
  },
  hwpx: {
    mimes: ["application/hwp+zip", "application/octet-stream"],
    canonicalContentType: "application/hwp+zip",
    magic: SIG.zip,
  },
  jpg: { mimes: ["image/jpeg"], canonicalContentType: "image/jpeg", magic: SIG.jpg },
  jpeg: { mimes: ["image/jpeg"], canonicalContentType: "image/jpeg", magic: SIG.jpg },
  png: { mimes: ["image/png"], canonicalContentType: "image/png", magic: SIG.png },
  webp: { mimes: ["image/webp"], canonicalContentType: "image/webp", magic: SIG.webp },
  mp4: { mimes: ["video/mp4", "application/octet-stream"], canonicalContentType: "video/mp4", magic: SIG.isoBmff },
  m4a: {
    mimes: ["audio/mp4", "audio/m4a", "audio/x-m4a", "application/octet-stream"],
    canonicalContentType: "audio/mp4",
    magic: SIG.isoBmff,
  },
};

/** Extensions that must always be rejected even if renamed/allow-shaped. */
const HARD_BLOCK_EXT = new Set([
  "html", "htm", "xhtml", "svg", "js", "mjs", "cjs", "apk", "jar", "exe", "bat", "cmd", "sh",
  "php", "phtml", "jsp", "asp", "aspx", "dll", "so", "msi", "scr", "com", "vbs", "ps1",
]);

/**
 * Validate an incoming messenger file upload.
 * @param buf full file bytes
 * @param ext lowercased extension (no dot)
 * @param browserMime browser-provided MIME (lowercased, trimmed)
 */
export function validateMessengerFileUpload(
  buf: Buffer,
  ext: string,
  browserMime: string,
): MessengerFileValidationResult {
  if (!buf || buf.length === 0) return { ok: false, error: "empty_file" };
  const e = ext.toLowerCase().trim();
  if (HARD_BLOCK_EXT.has(e)) return { ok: false, error: "blocked_file_type" };
  const entry = ALLOW[e];
  if (!entry) return { ok: false, error: "blocked_file_type" };

  // MIME must be in the allowlist for this ext (empty/missing browser MIME is tolerated — signature decides).
  const mime = (browserMime || "").toLowerCase().trim();
  const mimeOk = mime === "" || mime === "application/octet-stream" || entry.mimes.includes(mime);
  if (!mimeOk) return { ok: false, error: "file_type_mismatch" };

  // Signature check.
  if (entry.magic) {
    if (!entry.magic(buf)) return { ok: false, error: "file_type_mismatch" };
  } else {
    // text types: ensure not disguised markup/script/binary
    if (!isSafeTextStart(buf)) return { ok: false, error: "file_type_mismatch" };
  }

  return { ok: true, canonicalContentType: entry.canonicalContentType, ext: e };
}
