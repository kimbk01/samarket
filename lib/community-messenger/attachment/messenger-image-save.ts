"use client";

/**
 * 메신저 사진 저장 SSOT — 사진 보기(개별·모두 저장), 길게 누르기 메뉴, 자동 저장이 모두 이 모듈만 쓴다.
 *
 * - 앱(Capacitor): 네이티브 `MessengerPhotoLibrary.saveImages` → iOS Photo Library / Android MediaStore.
 *   웹 다운로드·외부 브라우저로 대체하지 않는다.
 * - 구버전 앱 바이너리(saveImages 없음): mode "none" → 저장 UI 를 표시하지 않는다(무반응 버튼 금지).
 * - 일반 웹 브라우저: 사진첩이 없으므로 `saveChatImagesToDevice`(공유 시트 1회/순차 다운로드)로 저장.
 *   공유 시트 취소는 실패가 아니라 `cancelled` 로 구분한다(다운로드로 대체하지 않음).
 */
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { saveChatImagesToDevice } from "@/lib/chats/save-chat-image";
import {
  probeMessengerNativeImageSaveSupport,
  saveImagesToNativePhotoLibrary,
} from "@/lib/community-messenger/attachment/messenger-photo-library";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

export type MessengerImageSaveMode = "native" | "web" | "none";

export type MessengerImageSaveOutcome = {
  mode: MessengerImageSaveMode;
  total: number;
  savedCount: number;
  failedCount: number;
  permissionDenied: boolean;
  /** 사용자가 웹 공유 시트를 취소함(실패 아님). */
  cancelled?: boolean;
};

export async function resolveMessengerImageSaveMode(): Promise<MessengerImageSaveMode> {
  if (isCapacitorNativePlatform()) {
    return (await probeMessengerNativeImageSaveSupport()) ? "native" : "none";
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
    | "cm_ui_photo_save_cancelled";
  params?: Record<string, number>;
  variant: "success" | "error" | "default";
};

/** 성공·실패·일부 실패·권한 거부를 정확히 구분한 결과 문구 키. */
export function messengerImageSaveNotice(outcome: MessengerImageSaveOutcome): MessengerImageSaveNotice {
  if (outcome.mode === "none") return { key: "cm_ui_photo_save_unsupported", variant: "error" };
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
