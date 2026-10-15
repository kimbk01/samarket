"use client";

/**
 * 채팅 이미지 저장(다운로드) — 모바일은 Web Share API(사진 앱) 우선, 미지원 시 blob 다운로드.
 * CDN CORS가 막혀 있으면 실패할 수 있음.
 *
 * 여러 장은 `saveChatImagesToDevice` 한 번으로 처리한다:
 * - `navigator.share` 는 사용자 활성화(user activation)가 1회만 유효 → 장마다 share 를 부르면 2장째부터 실패.
 *   그래서 `share({ files: 전체 })` **1회**.
 * - 공유 시트 취소(AbortError)는 사용자의 의사 → 다운로드로 대체하지 않고 `cancelled` 로 보고.
 * - share 미지원·거부(NotAllowedError 등)면 순차 앵커 다운로드.
 */

export type SaveChatImagesStatus = "saved" | "partial" | "cancelled" | "failed";

export type SaveChatImagesResult = {
  status: SaveChatImagesStatus;
  total: number;
  savedCount: number;
  failedCount: number;
  method: "share" | "download" | null;
};

type FetchedImage = { blob: Blob; name: string; mime: string };

function extFromMime(mime: string): string {
  return mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
}

async function fetchImageBlob(src: string, filenameBase: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const mime = blob.type || "image/jpeg";
    const name = `${filenameBase.replace(/\.[a-z0-9]+$/i, "")}.${extFromMime(mime)}`;
    return { blob, name, mime };
  } catch {
    return null;
  }
}

function isAbortError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { name?: unknown }).name === "AbortError");
}

function triggerAnchorDownload(img: FetchedImage): boolean {
  try {
    const url = URL.createObjectURL(img.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = img.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    /** 즉시 revoke 하면 일부 브라우저(Firefox)에서 다운로드가 끊긴다. */
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
    return true;
  } catch {
    return false;
  }
}

/** 연속 다운로드 간격 — 브라우저 다중 다운로드 차단 완화. */
const DOWNLOAD_GAP_MS = 180;

export async function saveChatImagesToDevice(
  srcs: ReadonlyArray<string>,
  filenameBase = "samarket-chat"
): Promise<SaveChatImagesResult> {
  const list = srcs.map((s) => String(s ?? "").trim()).filter(Boolean);
  const total = list.length;
  if (typeof window === "undefined" || total === 0) {
    return { status: "failed", total, savedCount: 0, failedCount: total, method: null };
  }
  const fetched = await Promise.all(
    list.map((src, i) => fetchImageBlob(src, total === 1 ? filenameBase : `${filenameBase}-${i + 1}`))
  );
  const images = fetched.filter((x): x is FetchedImage => x != null);
  const fetchFailed = total - images.length;
  if (images.length === 0) {
    return { status: "failed", total, savedCount: 0, failedCount: total, method: null };
  }
  const done = (savedCount: number, method: "share" | "download"): SaveChatImagesResult => {
    const failedCount = total - savedCount;
    return {
      status: savedCount === 0 ? "failed" : failedCount > 0 ? "partial" : "saved",
      total,
      savedCount,
      failedCount,
      method,
    };
  };

  if (typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare) {
    let files: File[] | null = null;
    try {
      files = images.map((img) => new File([img.blob], img.name, { type: img.mime }));
      if (!navigator.canShare({ files })) files = null;
    } catch {
      files = null;
    }
    if (files) {
      try {
        await navigator.share({ files, title: "사진 저장" });
        return done(images.length, "share");
      } catch (e) {
        if (isAbortError(e)) {
          return { status: "cancelled", total, savedCount: 0, failedCount: fetchFailed, method: "share" };
        }
        /* NotAllowedError(활성화 만료)·기타 — 다운로드로 */
      }
    }
  }

  let saved = 0;
  for (let i = 0; i < images.length; i += 1) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, DOWNLOAD_GAP_MS));
    if (triggerAnchorDownload(images[i]!)) saved += 1;
  }
  return done(saved, "download");
}

/** 단일 이미지 — 기존 호출부 호환(`{ ok, error }`). 공유 시트 취소는 `cancelled: true` (다운로드 대체 없음). */
export async function saveChatImageToDevice(
  src: string,
  filenameBase = "samarket-chat"
): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  if (typeof window === "undefined" || !src?.trim()) {
    return { ok: false, error: "이미지 주소가 없습니다." };
  }
  const r = await saveChatImagesToDevice([src], filenameBase);
  if (r.status === "saved") return { ok: true };
  if (r.status === "cancelled") return { ok: false, cancelled: true };
  return { ok: false, error: "저장에 실패했습니다. 네트워크·권한을 확인해 주세요." };
}
