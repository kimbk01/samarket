/**
 * Client-side Feed Banner image dimension check (Member upload UX).
 * Server still validates mime/size via validateCampaignImageFile.
 * FA-3 (2026-11-04): 비율 3:1 · 최소 1200×400 은 서버(`/api/me/feed-ad-requests/upload`)와 같은 함수로 미리 거른다.
 */

import { FEED_AD_RECOMMENDED_UPLOAD } from "@/lib/ads/feed-ad-geometry";
import { validateFeedAdUploadGeometry } from "@/lib/ads/feed-ad-upload-geometry";

export type FeedAdImageDimCheck =
  | { ok: true; width: number; height: number; belowStandard: boolean }
  | {
      ok: false;
      error: "read_failed" | "file_too_large" | "invalid_type" | "aspect_mismatch" | "below_min_pixels";
      width?: number;
      height?: number;
    };

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function readImageNaturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("read_failed"));
    };
    img.src = url;
  });
}

export async function checkFeedAdMemberImageFile(file: File): Promise<FeedAdImageDimCheck> {
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) return { ok: false, error: "invalid_type" };
  if (file.size > FEED_AD_RECOMMENDED_UPLOAD.maxFileBytes) {
    return { ok: false, error: "file_too_large" };
  }
  try {
    const { width, height } = await readImageNaturalSize(file);
    const geom = validateFeedAdUploadGeometry({ width, height });
    if (!geom.ok) {
      if (geom.error === "invalid_dimensions") return { ok: false, error: "read_failed" };
      return { ok: false, error: geom.error, width, height };
    }
    // 규격(최소 1200×400)을 통과한 이미지만 여기로 온다 — 작은 이미지 경고는 거부로 바뀌었다
    return { ok: true, width, height, belowStandard: false };
  } catch {
    return { ok: false, error: "read_failed" };
  }
}
