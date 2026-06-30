"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { openNativeCallPermissionSettings } from "@/lib/call/native/native-call-permissions";
import {
  openBatteryOptimizationSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { buildPermissionCapabilitySummary } from "@/lib/permissions/education/permission-capability-summary";
import { resyncAfterSettingsReturn } from "@/lib/permissions/education/permission-education-orchestrator";
import {
  filterCapabilityItemsForPlatform,
  isMobileNativePlatform,
  supportsNativeSettingsShortcut,
  supportsOemGuide,
} from "@/lib/permissions/education/permission-education-platform";
import { PermissionChecklist } from "@/components/permissions/education/PermissionChecklist";
import { OEMGuideCard } from "@/components/permissions/education/OEMGuideCard";
import type {
  PermissionCapabilityItem,
  PermissionCapabilitySummary,
} from "@/lib/permissions/education/permission-education-types";

type Props = {
  onClose: () => void;
};

async function openShortcutForItem(item: PermissionCapabilityItem): Promise<void> {
  if (!supportsNativeSettingsShortcut()) return;
  switch (item.id) {
    case "notifications":
      await openNotificationSettings();
      break;
    case "full_screen_intent":
    case "lock_screen_incoming":
      await openFullScreenIntentSettings();
      break;
    case "battery":
      await openBatteryOptimizationSettings();
      break;
    case "microphone":
    case "camera":
      await openNativeCallPermissionSettings();
      break;
    default:
      await openNotificationSettings();
  }
}

export function PermissionDiagnosticSheet({ onClose }: Props) {
  const { safeT } = useI18n();
  const [summary, setSummary] = useState<PermissionCapabilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = isMobileNativePlatform();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await buildPermissionCapabilitySummary({ forceSync: true });
      setSummary(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleItems = useMemo(
    () => (summary ? filterCapabilityItemsForPlatform(summary.items) : []),
    [summary],
  );

  const handleItemAction = useCallback(
    (item: PermissionCapabilityItem) => {
      if (!supportsNativeSettingsShortcut()) {
        void resyncAfterSettingsReturn().then(setSummary);
        return;
      }
      void openShortcutForItem(item).then(() => resyncAfterSettingsReturn().then(setSummary));
    },
    [],
  );

  return (
    <div
      className="fixed inset-0 z-[128] flex items-end justify-center bg-black/45 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-ui-rect bg-sam-surface p-5 shadow-xl sm:rounded-ui-rect">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`${Sam.text.sectionTitle} text-sam-fg`}>
              {safeT(isMobile ? "perm_edu_diagnostic_title" : "perm_edu_web_diagnostic_title", {
                fallbackKo: isMobile ? "통화 수신 준비 상태" : "브라우저 통화 권한 상태",
                fallbackEn: isMobile ? "Call receive readiness" : "Browser call permissions",
              })}
            </h2>
            <p className={`mt-2 ${Sam.text.bodySecondary} text-sam-muted`}>
              {safeT(isMobile ? "perm_edu_diagnostic_body" : "perm_edu_web_diagnostic_body", {
                fallbackKo: isMobile
                  ? "아래 항목을 확인하고 필요한 설정으로 이동할 수 있습니다."
                  : "브라우저 알림·마이크·카메라 권한을 확인하세요. 기기 설정 메뉴는 열리지 않습니다.",
                fallbackEn: isMobile
                  ? "Review each item below and jump to the setting you need."
                  : "Check browser notification, microphone, and camera permissions. Device settings are not opened here.",
              })}
            </p>
          </div>
          <button type="button" className={`${Sam.btn.ghostCombo} min-h-[40px] shrink-0 px-3`} onClick={onClose}>
            {safeT("perm_edu_cta_later", { fallbackKo: "닫기", fallbackEn: "Close" })}
          </button>
        </div>
        <div className="mt-4">
          {loading || !summary ? (
            <p className={`${Sam.text.helper} text-sam-muted`}>
              {safeT("settings_loading_settings", {
                fallbackKo: "설정을 불러오는 중…",
                fallbackEn: "Loading settings…",
              })}
            </p>
          ) : (
            <>
              <PermissionChecklist items={visibleItems} onItemAction={handleItemAction} />
              {!isMobile ? (
                <p className={`mt-3 ${Sam.text.helper} text-sam-muted`}>
                  {safeT("perm_edu_web_browser_media_help", {
                    fallbackKo:
                      "마이크·카메라는 브라우저 주소창의 자물쇠(사이트 정보)에서 이 사이트에 허용해 주세요.",
                    fallbackEn:
                      "Allow microphone and camera for this site via the lock or site-info icon in your browser.",
                  })}
                </p>
              ) : null}
              {supportsOemGuide() ? (
                <div className="mt-4">
                  <OEMGuideCard manufacturer={summary.manufacturer} />
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[44px]`} onClick={() => void refresh()}>
            {safeT("perm_edu_cta_allow", { fallbackKo: "다시 확인", fallbackEn: "Recheck" })}
          </button>
        </div>
      </div>
    </div>
  );
}
