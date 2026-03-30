"use client";

/**
 * 채팅 이미지 저장(다운로드) — 모바일은 Web Share API(사진 앱) 우선, 실패 시 blob 다운로드.
 * CDN CORS가 막혀 있으면 실패할 수 있음.
 */
export async function saveChatImageToDevice(
  src: string,
  filenameBase = "samarket-chat"
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !src?.trim()) {
    return { ok: false, error: "이미지 주소가 없습니다." };
  }
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return { ok: false, error: "이미지를 불러오지 못했습니다." };
    const blob = await res.blob();
    const mime = blob.type || "image/jpeg";
    const ext =
      mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
    const name = `${filenameBase.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;

    if (typeof navigator !== "undefined" && navigator.canShare) {
      try {
        const file = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "사진 저장" });
          return { ok: true };
        }
      } catch {
        /* share 취소·미지원 시 아래로 */
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, error: "저장에 실패했습니다. 네트워크·권한을 확인해 주세요." };
  }
}
