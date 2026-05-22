export type UploadStoreOwnerProductImageResult = {
  url: string;
  width?: number;
  height?: number;
};

/** 클라이언트 전용 — 서버 모듈에서 import 하지 마세요. */
export async function uploadStoreOwnerProductImage(
  storeId: string,
  file: File
): Promise<UploadStoreOwnerProductImageResult> {
  const fd = new FormData();
  fd.append("file", file, file.name || "image.jpg");
  const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/upload-image`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const json = (await res.json()) as {
    ok?: boolean;
    url?: string;
    width?: number;
    height?: number;
    error?: string;
    message?: string;
  };
  if (!json?.ok || !json.url) {
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
