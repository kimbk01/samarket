"use client";

/**
 * 배달 오픈 관리 이미지 — 업로드 전 기기에서 줄이기 (Owner 2026-11-10 「이미지를 올려도 안 보임」 · 설계 v3.2 §3-1).
 * 서버 한도: 원본 2MB · Vercel 요청 본문 4.5MB. 생성 이미지(PNG)는 2MB 를 넘기 쉬워서,
 * 2MB 를 넘거나 긴 변이 2400px 를 넘으면 긴 변 2400px·JPEG q0.9 로 한 번 줄여 보낸다.
 * 비율은 그대로라 서버의 비율·최소 크기 검사 결과는 같다. 서버가 WebP 로 다시 저장한다.
 */
const MAX_EDGE_PX = 2400;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.9;

export type PreparedLaunchImage = { file: File; width: number; height: number };

type Decoded = { w: number; h: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { w: bmp.width, h: bmp.height, draw: (c, w, h) => c.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
    } catch {
      /* <img> 로 */
    }
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode_failed"));
    el.src = url;
  });
  return {
    w: img.naturalWidth,
    h: img.naturalHeight,
    draw: (c, w, h) => c.drawImage(img, 0, 0, w, h),
    close: () => URL.revokeObjectURL(url),
  };
}

export async function prepareLaunchImageForUpload(file: File): Promise<PreparedLaunchImage> {
  const d = await decode(file);
  try {
    const longEdge = Math.max(d.w, d.h);
    if (file.size <= MAX_UPLOAD_BYTES && longEdge <= MAX_EDGE_PX) return { file, width: d.w, height: d.h };
    const scale = Math.min(1, MAX_EDGE_PX / longEdge);
    const w = Math.round(d.w * scale);
    const h = Math.round(d.h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    d.draw(ctx, w, h);
    // 줄인 뒤에도 2MB 를 넘으면 화질을 단계적으로 낮춘다 (감사 2026-11-10 — 줄인 뒤 크기 재확인)
    let blob: Blob | null = null;
    for (const q of [JPEG_QUALITY, 0.8, 0.7, 0.6]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (!blob) throw new Error("encode_failed");
      if (blob.size <= MAX_UPLOAD_BYTES) break;
    }
    if (!blob) throw new Error("encode_failed");
    const name = file.name.replace(/\.[^.]+$/, "") || "banner";
    return { file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }), width: w, height: h };
  } finally {
    d.close();
  }
}
