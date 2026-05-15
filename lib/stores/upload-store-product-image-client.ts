/** 클라이언트 전용 — 서버 모듈에서 import 하지 마세요. */
export async function uploadStoreOwnerProductImage(storeId: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/upload-image`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string; message?: string };
  if (!json?.ok || !json.url) {
    const msg =
      typeof json?.message === "string" && json.message.trim()
        ? json.message
        : typeof json?.error === "string"
          ? json.error
          : "upload_failed";
    throw new Error(msg);
  }
  return String(json.url);
}

export function readImageFileDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
