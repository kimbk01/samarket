"use client";

/**
 * 메신저 사진 저장 SSOT — 사진 보기(개별·모두 저장), 길게 누르기 메뉴, 자동 저장이 모두 이 모듈만 쓴다.
 *
 * - 앱(Capacitor): 네이티브 `MessengerPhotoLibrary.saveImages` → iOS Photo Library / Android MediaStore.
 *   Android·iOS 모두 같은 메뉴·같은 결과 문구, 저장 후 현재 화면 유지. 웹 다운로드·외부 브라우저로 대체하지 않는다.
 * - 구버전 앱 바이너리(saveImages 없음): mode "update_required".
 *   · Android: 사진 1장은 이전부터 쓰던 OS 다운로드(갤러리 「Download」 앨범)로 바로 넘긴다(기존 동작 유지).
 *   · iOS: Safari 로 자동 이동하지 않고 「앱 업데이트 필요」 안내 — 사용자가 「원본 열기」를 직접 누를 때만 연다.
 *   · 여러 장: 양쪽 모두 업데이트 안내(인앱 브라우저는 한 번에 한 장만 열 수 있음).
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
  readMessengerPhotoLibraryHeaderState,
  saveImagesToNativePhotoLibrary,
  type MessengerPhotoLibraryHeaderState,
} from "@/lib/community-messenger/attachment/messenger-photo-library";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  isMessengerMediaRouteUrl,
  withMessengerMediaRouteUrls,
} from "@/lib/community-messenger/media/messenger-media-ref";
import { resolveMessengerMediaUrlsForExternalUse } from "@/lib/community-messenger/media/messenger-media-external-url";

export type MessengerImageSaveMode = "native" | "update_required" | "web" | "none";

export type MessengerImageSaveOutcome = {
  mode: MessengerImageSaveMode;
  total: number;
  savedCount: number;
  failedCount: number;
  permissionDenied: boolean;
  /** 사용자가 웹 공유 시트를 취소함(실패 아님). */
  cancelled?: boolean;
  /** 구버전 앱: 저장하지 않고 업데이트 안내. `manualOpenUrl` 이 있으면 안내에 「원본 열기」를 붙인다. */
  updateRequired?: boolean;
  /** 구버전 Android: 원본을 OS 다운로드로 넘김(완료 여부는 OS 가 처리 — 성공 아님). */
  handedOff?: "android";
  manualOpenUrl?: string;
  /**
   * 저장하지 못한 원본 URL(요청 순서 유지) — 「다시 시도」는 이 목록만 재요청한다.
   * 어떤 장이 실패했는지 알 수 없는 경우(웹 공유 시트 일부 실패 등)는 생략한다.
   */
  failedUrls?: string[];
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

/**
 * 구버전 앱 — 사용자가 업데이트 안내의 「원본 열기」를 **직접** 눌렀을 때만 원본 1장을 인앱 브라우저로 연다
 * (iOS 인라인 → 길게 눌러 「사진 앱에 추가」 · Android 첨부 다운로드). 저장 버튼에서 자동으로 부르지 않는다.
 */
export function openMessengerImageOriginalForManualSave(url: string): boolean {
  const ios = hasIosCapacitorBridge();
  const leaf = decodeURIComponent(url.split("?")[0]?.split("/").pop() ?? "") || "dibay-photo.jpg";
  const target = ios ? url : buildMessengerFileDownloadUrl(url, leaf);
  return openMessengerFileInNativeShellIfNeeded(target);
}

export async function resolveMessengerImageSaveMode(): Promise<MessengerImageSaveMode> {
  if (isCapacitorNativePlatform()) {
    return (await probeMessengerNativeImageSaveSupport()) ? "native" : "update_required";
  }
  return typeof window === "undefined" ? "none" : "web";
}

/** 저장 가능한 사진 URL — http(s) 또는 C-4 첨부 조회 라우트(같은 오리진 상대 URL). */
function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u) || isMessengerMediaRouteUrl(u);
}

/** 첫 번째 비어 있지 않은 http(s)(또는 첨부 조회 라우트) URL — `??` 는 빈 문자열을 대체하지 못하므로 이 함수로 고른다. */
export function pickMessengerHttpUrl(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const u = String(c ?? "").trim();
    if (isHttpUrl(u)) return u;
  }
  return "";
}

type MessengerImageUrlSource = Pick<
  CommunityMessengerMessage,
  "messageType" | "content" | "imageAlbumUrls" | "imageAlbumOriginalUrls" | "imageOriginalUrl"
> &
  Partial<Pick<CommunityMessengerMessage, "id" | "roomId" | "pending">>;

/**
 * 앨범 칸(표시 순서)별 원본 URL — 칸 인덱스가 그대로 유지된다(저장 불가 칸은 "").
 * 원본이 비었거나 http 가 아니면 그 칸의 표시 URL 로 대체한다. 단일 사진은 길이 1.
 */
export function messengerImageOriginalUrlSlots(source: MessengerImageUrlSource): string[] {
  if (source.messageType !== "image") return [];
  /** C-4: id·roomId 가 있으면 저장 URL 을 첨부 조회 라우트로 투영(이미 라우트면 그대로). */
  const message =
    source.id && source.roomId
      ? withMessengerMediaRouteUrls({ ...source, id: source.id, roomId: source.roomId, content: source.content })
      : source;
  const album = message.imageAlbumUrls ?? [];
  if (album.length > 1) {
    const originals = message.imageAlbumOriginalUrls ?? [];
    const aligned = originals.length === album.length;
    return album.map((u, i) => pickMessengerHttpUrl(aligned ? originals[i] : null, u));
  }
  return [pickMessengerHttpUrl(message.imageOriginalUrl, message.content)];
}

/** 원본 화질 URL 목록 — 앨범은 원본 배열(없으면 표시 배열), 단일은 원본(없으면 content). */
export function messengerImageOriginalUrls(message: MessengerImageUrlSource): string[] {
  return messengerImageOriginalUrlSlots(message).filter(isHttpUrl);
}

export async function saveMessengerImages(urls: string[]): Promise<MessengerImageSaveOutcome> {
  const list = urls.map((u) => String(u ?? "").trim()).filter(isHttpUrl);
  const mode = await resolveMessengerImageSaveMode();
  const empty = { mode, total: list.length, savedCount: 0, failedCount: list.length, permissionDenied: false };
  if (list.length === 0 || mode === "none") return empty;
  /**
   * C-4: 첨부 조회 라우트 URL → 짧은 서명 URL (네이티브 다운로드·인앱 브라우저·Web Share fetch 는 WebView 쿠키가 없다).
   * `failedUrls`(다시 시도)는 원래 라우트 URL 을 유지한다 — 서명 URL 은 만료되므로.
   */
  const fetchList = await resolveMessengerMediaUrlsForExternalUse(list);
  if (mode === "update_required") {
    /** 화면 이동 없음 — 업데이트 안내만. 1장일 때만 사용자가 고를 수 있는 「원본 열기」를 둔다. */
    const single = list.length === 1 && isBrowserPluginAvailable();
    if (single && !hasIosCapacitorBridge() && openMessengerImageOriginalForManualSave(fetchList[0]!)) {
      return { ...empty, failedCount: 0, handedOff: "android" };
    }
    return { ...empty, updateRequired: true, ...(single ? { manualOpenUrl: fetchList[0]! } : {}) };
  }
  if (mode === "native") {
    const r = await saveImagesToNativePhotoLibrary(fetchList);
    const savedIdx = new Set(r.saved.filter((i) => i >= 0 && i < list.length));
    const savedCount = savedIdx.size;
    /** 실기기 검증용(Safari Web Inspector / chrome://inspect) — URL·개인정보 없이 결과만. */
    console.info(
      `[DIBAY_PHOTO_SAVE] native total=${list.length} saved=${savedCount} permission=${r.permission} failed=${JSON.stringify(
        r.failed.map((f) => f.reason),
      )}`,
    );
    return {
      mode,
      total: list.length,
      savedCount,
      failedCount: Math.max(0, list.length - savedCount),
      permissionDenied: r.permission === "denied" || r.failed.some((f) => f.reason === "permission_denied"),
      failedUrls: list.filter((_, i) => !savedIdx.has(i)),
    };
  }
  const r = await saveChatImagesToDevice(fetchList, `dibay-${Date.now()}`);
  const cancelled = r.status === "cancelled";
  return {
    mode,
    total: list.length,
    savedCount: r.savedCount,
    failedCount: cancelled ? 0 : r.failedCount,
    permissionDenied: false,
    cancelled,
    /** 웹은 어느 장이 실패했는지 알 수 없으므로 전부 실패일 때만 재시도 목록을 둔다. */
    ...(!cancelled && r.savedCount === 0 ? { failedUrls: list } : {}),
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
    | "cm_ui_photo_save_update_required"
    | "cm_ui_photo_save_browser_android";
  params?: Record<string, number>;
  variant: "success" | "error" | "default";
  /**
   * 스낵바 액션 — `retry`: 실패한 장만 다시 저장(outcome.failedUrls), `open_settings`: OS 앱 설정 열기,
   * `open_original`: 구버전 앱에서 사용자가 직접 원본 열기(outcome.manualOpenUrl).
   * 호출부가 실행 수단을 갖고 있을 때만 버튼을 붙인다(`presentMessengerImageSaveOutcome`).
   */
  action?: "retry" | "open_settings" | "open_original";
};

/** 성공·실패·일부 실패·권한 거부를 정확히 구분한 결과 문구 키. */
export function messengerImageSaveNotice(outcome: MessengerImageSaveOutcome): MessengerImageSaveNotice {
  if (outcome.mode === "none") return { key: "cm_ui_photo_save_unsupported", variant: "error" };
  if (outcome.handedOff === "android") return { key: "cm_ui_photo_save_browser_android", variant: "default" };
  if (outcome.updateRequired) {
    return {
      key: "cm_ui_photo_save_update_required",
      variant: "error",
      ...(outcome.manualOpenUrl ? { action: "open_original" as const } : {}),
    };
  }
  if (outcome.cancelled && outcome.savedCount === 0) return { key: "cm_ui_photo_save_cancelled", variant: "default" };
  const canRetry = (outcome.failedUrls?.length ?? 0) > 0;
  if (outcome.savedCount === 0 && outcome.permissionDenied) {
    return { key: "cm_ui_photo_save_permission_denied", variant: "error", action: "open_settings" };
  }
  if (outcome.savedCount === 0) {
    return { key: "cm_ui_photo_save_failed", variant: "error", ...(canRetry ? { action: "retry" as const } : {}) };
  }
  if (outcome.failedCount > 0) {
    return {
      key: "cm_ui_photo_save_partial",
      params: { saved: outcome.savedCount, failed: outcome.failedCount },
      variant: "error",
      ...(canRetry ? { action: "retry" as const } : {}),
    };
  }
  if (outcome.savedCount === 1) return { key: "cm_ui_photo_saved", variant: "success" };
  return { key: "cm_ui_photo_saved_count", params: { count: outcome.savedCount }, variant: "success" };
}

export type MessengerPhotoSaveDiagnostics = {
  mode: MessengerImageSaveMode;
  /** 설치된 앱 바이너리 버전·빌드(Capacitor App.getInfo) — 웹·조회 실패 시 null. */
  appVersion: string | null;
  appBuild: string | null;
  /** 앱 셸일 때 MessengerPhotoLibrary 헤더 판정 근거 — 웹은 null. */
  headerState: MessengerPhotoLibraryHeaderState | null;
};

/** 설정 화면 진단 줄 — 설치된 앱이 사진첩 바로 저장(saveImages)을 갖췄는지 기기에서 바로 확인한다. */
export async function getMessengerPhotoSaveDiagnostics(): Promise<MessengerPhotoSaveDiagnostics> {
  const mode = await resolveMessengerImageSaveMode();
  if (!isCapacitorNativePlatform()) return { mode, appVersion: null, appBuild: null, headerState: null };
  const headerState = readMessengerPhotoLibraryHeaderState();
  try {
    const { App } = await import("@capacitor/app");
    const info = await Promise.race([
      App.getInfo(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    const diag = { mode, appVersion: info?.version?.trim() || null, appBuild: info?.build?.trim() || null, headerState };
    console.info(`[DIBAY_PHOTO_SAVE] diag ${JSON.stringify(diag)}`);
    return diag;
  } catch {
    return { mode, appVersion: null, appBuild: null, headerState };
  }
}
