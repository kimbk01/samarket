/**
 * Intro CMS image upload contract.
 * Do not reuse Product Intro 2MB logo/background passthrough or 1080×1350 optimize.
 */

export const INTRO_ADMIN_UPLOAD_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
/** Stay under Vercel serverless body limit (~4.5MB) after multipart overhead. */
export const INTRO_ADMIN_UPLOAD_POST_MAX_BYTES = 3.2 * 1024 * 1024;
export const INTRO_ADMIN_UPLOAD_MAX_EDGE_PX = 4096;
export const INTRO_ADMIN_UPLOAD_BUCKET = "admin-notification-campaign-images";
export const INTRO_ADMIN_UPLOAD_FOLDER = "_admin/intro-v2";

const READY_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type IntroAdminUploadError =
  | "file_required"
  | "file_too_large"
  | "invalid_type"
  | "invalid_form"
  | "upload_failed"
  | "asset_create_failed"
  | "server_misconfigured"
  | "storage_bucket_missing";

export function sniffIntroUploadMime(input: { name?: string | null; type?: string | null }): string | null {
  const type = String(input.type ?? "").toLowerCase().trim();
  if (READY_MIMES.has(type)) return type === "image/jpg" ? "image/jpeg" : type;
  const name = String(input.name ?? "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return null;
}

export function inspectIntroUploadFile(file: { name?: string | null; type?: string | null; size: number }):
  | { ok: true; mime: string; needsCompress: boolean }
  | { ok: false; error: IntroAdminUploadError } {
  if (!file || file.size <= 0) return { ok: false, error: "file_required" };
  if (file.size > INTRO_ADMIN_UPLOAD_MAX_SOURCE_BYTES) return { ok: false, error: "file_too_large" };
  const mime = sniffIntroUploadMime(file);
  if (!mime) return { ok: false, error: "invalid_type" };
  return {
    ok: true,
    mime,
    needsCompress: file.size > INTRO_ADMIN_UPLOAD_POST_MAX_BYTES,
  };
}

export function introUploadExtForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

export function mapIntroUploadError(
  error: string | null | undefined,
  lang: "ko" | "en"
): string {
  switch (error) {
    case "file_too_large":
      return lang === "en"
        ? "Images must be 8MB or smaller."
        : "이미지는 8MB 이하여야 합니다.";
    case "invalid_type":
      return lang === "en"
        ? "Use PNG, JPG, or static WebP."
        : "PNG, JPG, 정적 WebP만 사용할 수 있습니다.";
    case "file_required":
      return lang === "en" ? "Choose an image file." : "이미지 파일을 선택해 주세요.";
    default:
      return lang === "en" ? "Upload failed." : "업로드에 실패했습니다.";
  }
}
