/**
 * Client-side Feed Banner image dimension check (Member upload UX).
 * Server still validates mime/size via validateCampaignImageFile.
 */

import {
  FEED_AD_RECOMMENDED_UPLOAD,
  FEED_AD_STANDARD_UPLOAD_HEIGHT_PX,
  FEED_AD_STANDARD_UPLOAD_WIDTH_PX,
} from "@/lib/ads/feed-ad-geometry";

export type FeedAdImageDimCheck =
  | { ok: true; width: number; height: number; belowStandard: boolean }
  | { ok: false; error: "read_failed" | "file_too_large" | "invalid_type" };

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
    const belowStandard =
      width < FEED_AD_STANDARD_UPLOAD_WIDTH_PX || height < FEED_AD_STANDARD_UPLOAD_HEIGHT_PX;
    return { ok: true, width, height, belowStandard };
  } catch {
    return { ok: false, error: "read_failed" };
  }
}
