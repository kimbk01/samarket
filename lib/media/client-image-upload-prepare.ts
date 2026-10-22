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

/**
 * `maxBytes` 이하면 원본 그대로(서버가 재인코딩). 초과면 긴 변 1600px 로 줄여 JPEG 로 압축.
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
