/**
 * CUT 5-R — client-side center-crop preview matching server creative-pipeline.
 * Produces a blob at canonical pixels for Admin confirmation before Save/upload.
 */

import { DIBAY_CANONICAL_POPUP_CREATIVE_SIZE } from "@/lib/platform-popup/creative-pixel-ssot";
import {
  centerCropBoxTo3625,
  isPlatformPopupCreativeRatioOk,
} from "@/lib/platform-popup/creative-pipeline-geometry";

export type PlatformPopupClientImageMeta = {
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  ratio: number;
  ratioOk: boolean;
  mime: string;
};

export async function readPlatformPopupImageMeta(file: File): Promise<PlatformPopupClientImageMeta> {
  const dims = await readImageDimensions(file);
  const ratio = dims.width / dims.height;
  return {
    fileName: file.name,
    fileSize: file.size,
    width: dims.width,
    height: dims.height,
    ratio,
    ratioOk: isPlatformPopupCreativeRatioOk(dims.width, dims.height),
    mime: file.type || "",
  };
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      if (!(width > 0) || !(height > 0)) reject(new Error("invalid_dimensions"));
      else resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    img.src = url;
  });
}

/** Draw center-crop → resize to canonical size; return object URL (caller must revoke). */
export async function buildPlatformPopupCenterCropPreviewUrl(
  file: File
): Promise<{ objectUrl: string; width: number; height: number; crop: ReturnType<typeof centerCropBoxTo3625> }> {
  const dims = await readImageDimensions(file);
  const crop = centerCropBoxTo3625(dims.width, dims.height);
  const targetW = DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width;
  const targetH = DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(
      img,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      targetW,
      targetH
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))),
        "image/webp",
        0.92
      );
    });
    return {
      objectUrl: URL.createObjectURL(blob),
      width: targetW,
      height: targetH,
      crop,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = url;
  });
}
