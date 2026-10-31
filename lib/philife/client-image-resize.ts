"use client";

/**
 * 커뮤니티 사진 업로드 전 축소 (CM-P1-03 · D12).
 * 서버가 어차피 WebP q82·긴 변 2560 으로 다시 인코딩하므로, 클라이언트는 **보낼 수 없을 때만** 줄인다.
 * - 긴 변 2560 이하이고 4MB 이하 → 원본 그대로 전송(손실 압축 1회 = 서버).
 * - 그 밖 → 긴 변 2560(서버 상한과 같게 — 서버 재축소 없음)·JPEG q0.92 로 한 번만 줄인다.
 * - 4MB 기준: 서버 한도 5MB · Vercel 요청 본문 4.5MB 보다 낮게.
 * GIF(애니메이션)·디코딩 불가(HEIC 미지원 WebView 등)는 원본 그대로 두고 서버 판정에 맡긴다.
 */
const MAX_EDGE_PX = 2560;
const JPEG_QUALITY = 0.92;
const SKIP_BELOW_BYTES = 4 * 1024 * 1024;

async function decode(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bmp.width,
        height: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        close: () => bmp.close(),
      };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode_failed"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export async function prepareCommunityImageForUpload(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (file.type === "image/gif") return file;
  const decoded = await decode(file);
  if (!decoded) return file;
  try {
    const { width, height } = decoded;
    const longEdge = Math.max(width, height);
    if (longEdge <= MAX_EDGE_PX && file.size <= SKIP_BELOW_BYTES) return file;
    const scale = longEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longEdge : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    decoded.draw(ctx, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const base = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    decoded.close();
  }
}

export type CommunityUploadResult = { ok: true; url: string } | { ok: false; error: string };

/** multipart 업로드 — 네트워크 오류·비 JSON 응답(413 등)도 실패로 돌려준다. */
export async function uploadCommunityImageFile(
  endpoint: string,
  file: File,
  messages: { network: string; tooLarge: string; failed: string }
): Promise<CommunityUploadResult> {
  let prepared = file;
  try {
    prepared = await prepareCommunityImageForUpload(file);
  } catch {
    prepared = file;
  }
  const fd = new FormData();
  fd.append("file", prepared);
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", body: fd, credentials: "include" });
  } catch {
    return { ok: false, error: messages.network };
  }
  let j: { ok?: boolean; url?: string; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    return { ok: false, error: res.status === 413 ? messages.tooLarge : messages.failed };
  }
  if (res.ok && j.ok && typeof j.url === "string" && j.url) return { ok: true, url: j.url };
  return { ok: false, error: j.error || (res.status === 413 ? messages.tooLarge : messages.failed) };
}
