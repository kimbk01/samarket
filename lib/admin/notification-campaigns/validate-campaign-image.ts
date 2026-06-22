const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const CAMPAIGN_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type CampaignImageValidationResult =
  | { ok: true; mime: string; size: number }
  | { ok: false; error: "file_required" | "file_too_large" | "invalid_type" | "invalid_url" };

export function validateCampaignImageFile(file: File): CampaignImageValidationResult {
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "file_required" };
  }
  if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    return { ok: false, error: "invalid_type" };
  }
  return { ok: true, mime, size: file.size };
}

export function validateCampaignImageUrl(url: string): CampaignImageValidationResult {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: "invalid_url" };
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return { ok: false, error: "invalid_url" };
    }
    return { ok: true, mime: "image/remote", size: 0 };
  } catch {
    return { ok: false, error: "invalid_url" };
  }
}

export function extForCampaignImageMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}
