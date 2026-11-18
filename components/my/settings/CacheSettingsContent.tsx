"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { clearAppClientCaches } from "@/lib/mypage/clear-app-client-caches";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import {
  clearNativeCameraTemp,
  clearNativeWebCache,
  formatStorageBytes,
  hasNativeDeviceStoragePlugin,
  readDeviceStorageBreakdown,
  type DeviceStorageBreakdown,
} from "@/lib/storage/device-storage-native.client";

/**
 * 임시 데이터 삭제 (최종 설계 S17 · 용어 `docs/i18n-ssot.md` §4-2 — 「캐시」 는 매장 화폐라 쓰지 않음).
 * 지울 항목 설명 → 지우지 않는 것 → 하단 [임시 데이터 삭제].
 * 「지우는 항목」 은 `clearAppClientCaches` 실제 대상과 1:1 (2026-11-19): 시작 화면 미디어(Cache Storage) ·
 * 목록 저장본(local/session 레지스트리) · 채팅방 화면 사본(IndexedDB) · 스크롤 위치 등 화면 상태(session).
 *
 * S2 (2026-11-19, docs/audit/device-storage-legacy-design-2026-11-19.md §4 S2) — 네이티브 플러그인 `DibayDeviceStorage` 가 있는 앱만:
 * 레거시 앱처럼 항목별 용량 표시 + 사진·영상 임시 파일·카메라 임시 사진 항목별 삭제, 하단 버튼이 두 항목까지 함께 지운다.
 * 플러그인이 없는 구 바이너리·웹은 기존 화면 그대로(사진은 「지우지 않는 항목」).
 */
export function CacheSettingsContent() {
  /** 하단탭 실제 마운트 기준 CTA 본문 여백 — 탭 있음/없음 safe 1회 (M-04) */
  const stickyCtaBodyClearanceClass = resolveMyStickyCtaBodyClearanceClass(useBottomNavOccupiesClearance());
  const { t } = useI18n();
  const { run, pending } = useMypageSubmitGuard();
  const [nativeAvailable] = useState(() => hasNativeDeviceStoragePlugin());
  const [usage, setUsage] = useState<DeviceStorageBreakdown | null>(null);

  const refreshUsage = useCallback(async () => {
    if (!nativeAvailable) return;
    setUsage(await readDeviceStorageBreakdown());
  }, [nativeAvailable]);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  const clearAll = async () => {
    if (pending) return;
    const ok = await dibayConfirm({
      title: t("popup_q_delete_cache"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_delete"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    await run(async () => {
      try {
        await clearAppClientCaches();
        if (nativeAvailable) {
          await clearNativeWebCache();
          await clearNativeCameraTemp();
        }
        showMypageToast(t("mypage_cache_clear_done"), "success");
      } catch {
        showMypageToast(t("mypage_cache_clear_failed"), "error");
      }
      await refreshUsage();
    });
  };

  const clearOne = async (which: "media" | "camera") => {
    if (pending) return;
    await run(async () => {
      const r = which === "media" ? await clearNativeWebCache() : await clearNativeCameraTemp();
      showMypageToast(t(r ? "mypage_cache_clear_done" : "mypage_cache_clear_failed"), r ? "success" : "error");
      await refreshUsage();
    });
  };

  const usageRow = (label: string, bytes: number | null, onDelete?: () => void) => (
    <li className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
      <span className="sam-text-body-secondary text-sam-fg">{label}</span>
      <span className="flex items-center gap-3">
        <span className="sam-text-body-secondary text-sam-muted tabular-nums">
          {bytes == null ? t("mypage_s17_usage_loading") : formatStorageBytes(bytes)}
        </span>
        {onDelete ? (
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border px-3 py-1 sam-text-body-secondary text-sam-fg disabled:opacity-50"
            disabled={pending || bytes == null || bytes === 0}
            onClick={onDelete}
          >
            {t("mypage_s17_usage_delete_btn")}
          </button>
        ) : null}
      </span>
    </li>
  );

  return (
    <div className={`space-y-2 ${stickyCtaBodyClearanceClass}`} data-testid="cache-settings">
      <p className="px-1 pb-1 sam-text-body text-sam-muted">{t("mypage_cache_clear_desc")}</p>
      {nativeAvailable ? (
        <MyGroup title={t("mypage_s17_usage_title")}>
          <ul className="divide-y divide-sam-border" data-testid="cache-settings-usage">
            {usageRow(t("mypage_s17_usage_media"), usage?.native?.webCacheBytes ?? null, () => void clearOne("media"))}
            {usageRow(t("mypage_s17_usage_camera"), usage?.native?.cameraTempBytes ?? null, () => void clearOne("camera"))}
            {usageRow(t("mypage_s17_usage_chat_rooms"), usage ? usage.chatRoomsBytes : null)}
            {usageRow(t("mypage_s17_usage_lists"), usage ? usage.listsBytes : null)}
          </ul>
        </MyGroup>
      ) : null}
      <MyGroup title={t("mypage_s17_clears_title")}>
        <ul className="list-disc space-y-1 px-4 py-3 pl-8 sam-text-body-secondary text-sam-fg md:px-5 md:pl-9">
          <li>{t("mypage_s17_clears_images")}</li>
          {nativeAvailable ? <li>{t("mypage_s17_clears_media_files")}</li> : null}
          {nativeAvailable ? <li>{t("mypage_s17_clears_camera_temp")}</li> : null}
          <li>{t("mypage_s17_clears_lists")}</li>
          <li>{t("mypage_s17_clears_chat_rooms")}</li>
          <li>{t("mypage_s17_clears_screens")}</li>
        </ul>
      </MyGroup>
      <MyGroup title={t("mypage_s17_keeps_title")}>
        <ul className="list-disc space-y-1 px-4 py-3 pl-8 sam-text-body-secondary text-sam-fg md:px-5 md:pl-9">
          <li>{t("mypage_s17_keeps_login")}</li>
          <li>{t("mypage_s17_keeps_chats")}</li>
          <li>{t("mypage_s17_keeps_consent")}</li>
          <li>{t("mypage_s17_keeps_language")}</li>
          <li>{t("mypage_s17_keeps_drafts")}</li>
          <li>{nativeAvailable ? t("mypage_s17_keeps_gallery_photos") : t("mypage_s17_keeps_photos")}</li>
        </ul>
      </MyGroup>
      <MyStickyCta
        dirty
        primaryTone="secondary"
        primary={{ label: t("settings_cache_clear"), onPress: () => void clearAll(), loading: pending }}
      />
    </div>
  );
}
