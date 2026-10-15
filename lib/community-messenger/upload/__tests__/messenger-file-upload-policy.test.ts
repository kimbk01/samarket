import { describe, expect, it } from "vitest";
import {
  MESSENGER_FILE_UPLOAD_ACCEPT,
  MESSENGER_FILE_UPLOAD_ALLOWED_EXTS,
  MESSENGER_FILE_UPLOAD_MAX_BYTES,
  deriveMessengerFileExtension,
  precheckMessengerFileForUpload,
  sanitizeMessengerFileDisplayName,
} from "@/lib/community-messenger/upload/messenger-file-upload-policy";
import { validateMessengerFileUpload } from "@/lib/community-messenger/upload/validate-messenger-file-upload";

describe("sanitizeMessengerFileDisplayName", () => {
  it("preserves Korean names", () => {
    expect(sanitizeMessengerFileDisplayName("2026년 사업계획서 (최종).pdf")).toBe("2026년 사업계획서 (최종).pdf");
  });

  it("NFC-normalizes decomposed (NFD) Hangul from iOS/macOS", () => {
    const nfd = "보고서.hwp".normalize("NFD");
    expect(nfd).not.toBe("보고서.hwp");
    expect(sanitizeMessengerFileDisplayName(nfd)).toBe("보고서.hwp");
  });

  it("strips path traversal / directory components", () => {
    expect(sanitizeMessengerFileDisplayName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeMessengerFileDisplayName("..\\..\\windows\\계약서.docx")).toBe("계약서.docx");
    expect(sanitizeMessengerFileDisplayName("../")).toBe("file");
    expect(sanitizeMessengerFileDisplayName("..")).toBe("file");
  });

  it("removes control and bidi-override characters and trims", () => {
    expect(sanitizeMessengerFileDisplayName("  a\u0000b\u001fc\u007f.txt  ")).toBe("abc.txt");
    expect(sanitizeMessengerFileDisplayName("invoice‮fdp.exe")).toBe("invoicefdp.exe");
  });

  it("falls back to 'file' for empty input", () => {
    expect(sanitizeMessengerFileDisplayName("")).toBe("file");
    expect(sanitizeMessengerFileDisplayName("   ")).toBe("file");
    expect(sanitizeMessengerFileDisplayName(null)).toBe("file");
  });

  it("caps at 200 chars while keeping the extension", () => {
    const long = `${"가".repeat(300)}.pdf`;
    const out = sanitizeMessengerFileDisplayName(long);
    expect(Array.from(out).length).toBe(200);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});

describe("deriveMessengerFileExtension", () => {
  it("derives lowercase extension from the original (Korean) name", () => {
    expect(deriveMessengerFileExtension("견적서.PDF")).toBe("pdf");
    expect(deriveMessengerFileExtension("자료.tar.ZIP")).toBe("zip");
  });

  it("returns 'bin' for missing / unsafe / too-long extensions", () => {
    expect(deriveMessengerFileExtension("README")).toBe("bin");
    expect(deriveMessengerFileExtension(".pdf")).toBe("bin");
    expect(deriveMessengerFileExtension("a.")).toBe("bin");
    expect(deriveMessengerFileExtension("a.한글")).toBe("bin");
    expect(deriveMessengerFileExtension("a.abcdefghijk")).toBe("bin");
    expect(deriveMessengerFileExtension("a.p-d")).toBe("bin");
  });

  it("does not let path components leak into the extension", () => {
    expect(deriveMessengerFileExtension("evil.pdf/../x")).toBe("bin");
    expect(deriveMessengerFileExtension("dir.v2/report.pdf")).toBe("pdf");
  });
});

describe("precheckMessengerFileForUpload (client mirror of server policy)", () => {
  it("accepts allowed types under the size cap", () => {
    expect(precheckMessengerFileForUpload({ name: "보고서.pdf", size: 1024 })).toEqual({
      ok: true,
      ext: "pdf",
      displayName: "보고서.pdf",
    });
  });

  it("rejects oversized files with file_too_large", () => {
    expect(precheckMessengerFileForUpload({ name: "a.pdf", size: MESSENGER_FILE_UPLOAD_MAX_BYTES + 1 })).toEqual({
      ok: false,
      error: "file_too_large",
    });
  });

  it("rejects blocked / unknown extensions and empty files", () => {
    expect(precheckMessengerFileForUpload({ name: "x.html", size: 10 })).toEqual({ ok: false, error: "blocked_file_type" });
    expect(precheckMessengerFileForUpload({ name: "x.apk", size: 10 })).toEqual({ ok: false, error: "blocked_file_type" });
    expect(precheckMessengerFileForUpload({ name: "x.rar", size: 10 })).toEqual({ ok: false, error: "blocked_file_type" });
    expect(precheckMessengerFileForUpload({ name: "x.pdf", size: 0 })).toEqual({ ok: false, error: "empty_file" });
  });

  it("accept attribute is derived from the same allowlist", () => {
    expect(MESSENGER_FILE_UPLOAD_ACCEPT.split(",")).toEqual(MESSENGER_FILE_UPLOAD_ALLOWED_EXTS.map((e) => `.${e}`));
  });

  it("server validator still enforces the shared allowlist", () => {
    const pdf = Buffer.from("%PDF-1.7\n");
    expect(validateMessengerFileUpload(pdf, "pdf", "application/pdf")).toMatchObject({ ok: true, ext: "pdf" });
    expect(validateMessengerFileUpload(pdf, "rar", "")).toEqual({ ok: false, error: "blocked_file_type" });
    expect(validateMessengerFileUpload(pdf, "svg", "")).toEqual({ ok: false, error: "blocked_file_type" });
  });
});
