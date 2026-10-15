"use client";

/**
 * 메신저 사진 저장 SSOT — 사진 보기(개별·모두 저장), 길게 누르기 메뉴, 자동 저장이 모두 이 모듈만 쓴다.
 *
 * - 앱(Capacitor): 네이티브 `MessengerPhotoLibrary.saveImages` → iOS Photo Library / Android MediaStore.
 *   웹 다운로드·외부 브라우저로 대체하지 않는다.
 * - 구버전 앱 바이너리(saveImages 없음): mode "browser" — 기존(18816653 이전) 저장 경로를 유지한다.
 *   원본을 `@capacitor/browser`(SFSafariViewController / Custom Tabs)로 연다:
 *     · iOS: 인라인 원본 → 사진 길게 누르기 「사진 앱에 추가」(앱이 NSPhotoLibraryAddUsageDescription 보유)
 *     · Android: `?download=` 첨부 URL → OS 다운로드(갤러리 「Download」 앨범)
 *   실제 저장 완료를 앱이 알 수 없으므로 성공 문구를 내지 않고 안내 문구만 낸다(거짓 성공 금지).
 *   한 번에 여러 장은 열 수 없으므로 브라우저 모드는 사진 1장 단위로만 노출한다.
 * - Browser 플러그인도 없는 바이너리: mode "none" → 저장 UI 미표시.
 * - 일반 웹 브라우저: 사진첩이 없으므로 `saveChatImagesToDevice`(공유 시트 1회/순차 다운로드)로 저장.
 *   공유 시트 취소는 실패가 아니라 `cancelled` 로 구분한다(다운로드로 대체하지 않음).
 */
import { hasIosCapacitorBridge, isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  buildMessengerFileDownloadUrl,
  openMessengerFileInNativeShellIfNeeded,
} from "@/lib/community-messenger/messenger-file-download";
import { saveChatImagesToDevice } from "@/lib/chats/save-chat-image";
import {
  probeMessengerNativeImageSaveSupport,
  saveImagesToNativePhotoLibrary,
} from "@/lib/community-messenger/attachment/messenger-photo-library";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

export type MessengerImageSaveMode = "native" | "browser" | "web" | "none";

export type MessengerImageSaveOutcome = {
  mode: MessengerImageSaveMode;
  total: number;
  savedCount: number;
  failedCount: number;
  permissionDenied: boolean;
  /** 사용자가 웹 공유 시트를 취소함(실패 아님). */
  cancelled?: boolean;
  /** 브라우저 모드: 인앱 브라우저로 원본을 넘김(저장 완료 여부는 OS 가 처리 — 성공 아님). */
  handedOff?: "ios" | "android";
};

function isBrowserPluginAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
  try {
    return typeof cap?.isPluginAvailable === "function" ? cap.isPluginAvailable("Browser") === true : false;
  } catch {
    return false;
  }
}

/** 브라우저 모드에서 사진 1장을 OS 저장 경로로 넘긴다(iOS 인라인 · Android 첨부 다운로드). */
function handOffImageToNativeBrowser(url: string): "ios" | "android" | null {
  const ios = hasIosCapacitorBridge();
  const leaf = decodeURIComponent(url.split("?")[0]?.split("/").pop() ?? "") || "dibay-photo.jpg";
  const target = ios ? url : buildMessengerFileDownloadUrl(url, leaf);
  return openMessengerFileInNativeShellIfNeeded(target) ? (ios ? "ios" : "android") : null;
}

export async function resolveMessengerImageSaveMode(): Promise<MessengerImageSaveMode> {
  if (isCapacitorNativePlatform()) {
    if (await probeMessengerNativeImageSaveSupport()) return "native";
    return isBrowserPluginAvailable() ? "browser" : "none";
  }
  return typeof window === "undefined" ? "none" : "web";
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

/** 원본 화질 URL 목록 — 앨범은 원본 배열(없으면 표시 배열), 단일은 원본(없으면 content). */
export function messengerImageOriginalUrls(
  message: Pick<
    CommunityMessengerMessage,
    "messageType" | "content" | "imageAlbumUrls" | "imageAlbumOriginalUrls" | "imageOriginalUrl"
  >
): string[] {
  if (message.messageType !== "image") return [];
  const album = message.imageAlbumUrls ?? [];
  if (album.length > 1) {
    const originals = message.imageAlbumOriginalUrls ?? [];
    const pick = originals.length === album.length ? originals : album;
    return pick.map((u) => String(u ?? "").trim()).filter(isHttpUrl);
  }
  const single = String(message.imageOriginalUrl ?? message.content ?? "").trim();
  return isHttpUrl(single) ? [single] : [];
}

export async function saveMessengerImages(urls: string[]): Promise<MessengerImageSaveOutcome> {
  const list = urls.map((u) => String(u ?? "").trim()).filter(isHttpUrl);
  const mode = await resolveMessengerImageSaveMode();
  const empty = { mode, total: list.length, savedCount: 0, failedCount: list.length, permissionDenied: false };
  if (list.length === 0 || mode === "none") return empty;
  if (mode === "browser") {
    /** 여러 장은 한 번에 열 수 없다 — 호출부는 브라우저 모드에서 1장 단위만 노출한다. */
    if (list.length !== 1) return empty;
    const handedOff = handOffImageToNativeBrowser(list[0]!);
    if (!handedOff) return empty;
    return { mode, total: 1, savedCount: 0, failedCount: 0, permissionDenied: false, handedOff };
  }
  if (mode === "native") {
    const r = await saveImagesToNativePhotoLibrary(list);
    const savedCount = new Set(r.saved).size;
    return {
      mode,
      total: list.length,
      savedCount,
      failedCount: Math.max(0, list.length - savedCount),
      permissionDenied: r.permission === "denied" || r.failed.some((f) => f.reason === "permission_denied"),
    };
  }
  const r = await saveChatImagesToDevice(list, `dibay-${Date.now()}`);
  return {
    mode,
    total: list.length,
    savedCount: r.savedCount,
    failedCount: r.status === "cancelled" ? 0 : r.failedCount,
    permissionDenied: false,
    cancelled: r.status === "cancelled",
  };
}

export type MessengerImageSaveNotice = {
  key:
    | "cm_ui_photo_saved"
    | "cm_ui_photo_saved_count"
    | "cm_ui_photo_save_partial"
    | "cm_ui_photo_save_failed"
    | "cm_ui_photo_save_permission_denied"
    | "cm_ui_photo_save_unsupported"
    | "cm_ui_photo_save_cancelled"
    | "cm_ui_photo_save_browser_ios"
    | "cm_ui_photo_save_browser_android";
  params?: Record<string, number>;
  variant: "success" | "error" | "default";
};

/** 성공·실패·일부 실패·권한 거부를 정확히 구분한 결과 문구 키. */
export function messengerImageSaveNotice(outcome: MessengerImageSaveOutcome): MessengerImageSaveNotice {
  if (outcome.mode === "none") return { key: "cm_ui_photo_save_unsupported", variant: "error" };
  if (outcome.handedOff === "ios") return { key: "cm_ui_photo_save_browser_ios", variant: "default" };
  if (outcome.handedOff === "android") return { key: "cm_ui_photo_save_browser_android", variant: "default" };
  if (outcome.cancelled && outcome.savedCount === 0) return { key: "cm_ui_photo_save_cancelled", variant: "default" };
  if (outcome.savedCount === 0 && outcome.permissionDenied) {
    return { key: "cm_ui_photo_save_permission_denied", variant: "error" };
  }
  if (outcome.savedCount === 0) return { key: "cm_ui_photo_save_failed", variant: "error" };
  if (outcome.failedCount > 0) {
    return {
      key: "cm_ui_photo_save_partial",
      params: { saved: outcome.savedCount, failed: outcome.failedCount },
      variant: "error",
    };
  }
  if (outcome.savedCount === 1) return { key: "cm_ui_photo_saved", variant: "success" };
  return { key: "cm_ui_photo_saved_count", params: { count: outcome.savedCount }, variant: "success" };
}
