import {
  prepareImageFileForFunctionUpload,
  readFunctionUploadJson,
} from "@/lib/media/client-image-upload-prepare";
import { OWNER_PRODUCT_IMAGE_MAX_BYTES } from "@/lib/stores/owner-product-images";

export type UploadStoreOwnerProductImageResult = {
  url: string;
  width?: number;
  height?: number;
};

export type StoreOwnerImageUploadJson = {
  ok?: boolean;
  url?: string;
  width?: number;
  height?: number;
  error?: string;
  message?: string;
};

/**
 * IMG-02 — 매장 이미지 업로드(`/api/me/stores/{id}/upload-image`) 공통 전송 (클라이언트 전용).
 * 함수 본문 한도 아래로 먼저 줄이고, 413(비 JSON) 등은 `file_too_large` / `upload_failed` 코드로 돌려준다.
 */
export async function postStoreOwnerImageUpload(
  storeId: string,
  file: File,
  /** 3-C §9-3 — 관리자 샘플 편집은 `/api/admin/stores/{id}/sample-catalog` (기본 = 오너 경로) */
  apiBase: string = `/api/me/stores/${encodeURIComponent(storeId)}`
): Promise<{ ok: boolean; json: StoreOwnerImageUploadJson }> {
  const prepared = await prepareImageFileForFunctionUpload(file, OWNER_PRODUCT_IMAGE_MAX_BYTES);
  if (!prepared.ok) return { ok: false, json: { ok: false, error: prepared.error } };
  const fd = new FormData();
  fd.append("file", prepared.file, prepared.file.name || "image.jpg");
  const res = await fetch(`${apiBase}/upload-image`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const json = await readFunctionUploadJson<StoreOwnerImageUploadJson>(res);
  return { ok: res.ok && json.ok === true && Boolean(json.url), json };
}

/** 클라이언트 전용 — 서버 모듈에서 import 하지 마세요. */
export async function uploadStoreOwnerProductImage(
  storeId: string,
  file: File,
  apiBase?: string
): Promise<UploadStoreOwnerProductImageResult> {
  const { ok, json } = await postStoreOwnerImageUpload(storeId, file, apiBase);
  if (!ok || !json.url) {
    const msg =
      typeof json?.message === "string" && json.message.trim()
        ? json.message
        : typeof json?.error === "string"
          ? json.error
          : "upload_failed";
    throw new Error(msg);
  }
  const width = typeof json.width === "number" && Number.isFinite(json.width) ? json.width : undefined;
  const height =
    typeof json.height === "number" && Number.isFinite(json.height) ? json.height : undefined;
  return { url: String(json.url), width, height };
}

export async function readImageFileDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const out = { width: bmp.width, height: bmp.height };
      bmp.close();
      if (out.width > 0 && out.height > 0) return out;
    } catch {
      /* fall through — 고해상도는 브라우저 디코드 실패해도 서버 업로드로 검증 */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      resolve(w > 0 && h > 0 ? { width: w, height: h } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
