/**
 * IMG-02 — 함수(Vercel) 경유 multipart 이미지 업로드 전 클라이언트 축소·압축 (클라이언트 전용).
 *
 * Vercel 서버리스 함수 요청 본문 한도(~4.5MB)를 넘는 multipart 는 라우트에 닿기 전에 413(비 JSON)으로 잘린다
 * (`lib/launch-intro/server.ts` · `messenger-direct-upload-policy.ts` 와 같은 근거). 카메라 원본(5~12MB)은
 * 거래 글쓰기 편집기와 같은 캔버스 유틸(`image-editor-canvas.ts`, 긴 변 1600px)로 줄여 보낸다.
 * 서버는 받은 이미지를 sharp 로 다시 인코딩(회전 적용·메타데이터 제거)하므로 화질 기준은 서버가 정한다.
 */
import {
  blobToFile,
  canvasToBlob,
  createWorkingCanvasFromImage,
  loadImage,
} from "@/components/write/shared/image-editor-canvas";
import { FUNCTION_MULTIPART_IMAGE_SAFE_MAX_BYTES } from "@/lib/media/function-upload-limits";

const JPEG_QUALITY_STEPS = [0.88, 0.8, 0.7, 0.6] as const;

export type PrepareImageForUploadResult =
  | { ok: true; file: File; resized: boolean }
  | { ok: false; error: "file_too_large" };

function renameWithExt(name: string, ext: string): string {
  const base = (name || "image").replace(/\.[^./]+$/, "") || "image";
  return `${base}.${ext}`;
}

/** PNG·WebP 원본은 투명 픽셀이 있을 수 있다 — JPEG 로 바꾸면 배경이 검게/흰색으로 굳는다. */
function sourceMayHaveAlpha(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  return t === "image/png" || t === "image/webp" || /\.(png|webp)$/i.test(file.name || "");
}

/** 캔버스에 실제 투명(alpha < 255) 픽셀이 있는지 — 없으면 JPEG 로 줄여도 손실이 없다. */
function canvasHasTransparentPixel(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  try {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * `maxBytes` 이하면 원본 그대로(서버가 재인코딩). 초과면 긴 변 1600px 로 줄여 압축.
 * - 투명 픽셀이 없으면 JPEG.
 * - 투명 픽셀이 있으면 WebP(알파 유지). WebP 인코딩을 지원하지 않는 WebView(toBlob 이 PNG 로 대체)면 PNG 1회.
 *   알파를 버리는 JPEG 로는 바꾸지 않는다 — 서버(sharp → WebP)도 알파를 유지한다.
 * 디코드할 수 없거나 줄여도 상한을 넘으면 `file_too_large` (보내면 함수 앞단 413 이 확실하므로 전송하지 않는다).
 */
export async function prepareImageFileForFunctionUpload(
  file: File,
  maxBytes: number = FUNCTION_MULTIPART_IMAGE_SAFE_MAX_BYTES
): Promise<PrepareImageForUploadResult> {
  if (file.size <= maxBytes) return { ok: true, file, resized: false };
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return { ok: false, error: "file_too_large" };
  }

  const objectUrl = URL.createObjectURL(file);
  let canvas: HTMLCanvasElement;
  try {
    const img = await loadImage(objectUrl);
    canvas = createWorkingCanvasFromImage(img);
  } catch {
    // 디코드 불가(예: Android 의 HEIC) + 상한 초과 → 보내도 413 이므로 전송하지 않는다
    return { ok: false, error: "file_too_large" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  try {
    return await encodePreparedCanvas(file, canvas, maxBytes);
  } finally {
    /** 원본 해상도 비트맵을 바로 돌려준다 — 여러 장을 이어서 처리할 때 메모리 누적 방지 */
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function encodePreparedCanvas(
  file: File,
  canvas: HTMLCanvasElement,
  maxBytes: number
): Promise<PrepareImageForUploadResult> {
  if (sourceMayHaveAlpha(file) && canvasHasTransparentPixel(canvas)) {
    for (const q of JPEG_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, "image/webp", q);
      if (blob.type !== "image/webp") {
        // WebP 인코딩 미지원 → 브라우저가 PNG 로 대체. 품질 단계가 의미 없으므로 1회만 판정.
        if (blob.size <= maxBytes) {
          return { ok: true, file: blobToFile(blob, renameWithExt(file.name, "png")), resized: true };
        }
        return { ok: false, error: "file_too_large" };
      }
      if (blob.size <= maxBytes) {
        return { ok: true, file: blobToFile(blob, renameWithExt(file.name, "webp")), resized: true };
      }
    }
    return { ok: false, error: "file_too_large" };
  }

  for (const q of JPEG_QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, "image/jpeg", q);
    if (blob.size <= maxBytes) {
      return { ok: true, file: blobToFile(blob, renameWithExt(file.name, "jpg")), resized: true };
    }
  }
  return { ok: false, error: "file_too_large" };
}

/**
 * 함수 업로드 응답 본문 — 413(비 JSON)·HTML 오류 페이지면 status 로 오류 코드를 정한다.
 * `res.json()` 예외로 업로드 실패가 일반 오류로 바뀌지 않게 한다.
 */
export async function readFunctionUploadJson<T extends { ok?: boolean; error?: string }>(
  res: Response
): Promise<T & { ok?: boolean; error?: string }> {
  const json = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (json && typeof json === "object") return json;
  const error = res.status === 413 ? "file_too_large" : "upload_failed";
  return { ok: false, error } as T & { ok?: boolean; error?: string };
}
