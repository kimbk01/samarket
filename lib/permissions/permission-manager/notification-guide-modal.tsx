"use client";

import { useEffect, useReducer } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  getNotificationGuidePending,
  settleNotificationGuideModal,
  subscribeNotificationGuideBridge,
} from "@/lib/permissions/permission-manager/notification-permission-ui-bridge";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { openNotificationSettings } from "@/lib/permissions/permission-manager/notification-permission-manager";

/**
 * Settings-only notification fallback — OS prompt unavailable (denied/permanent/system disabled).
 * Not used for default OS permission requests.
 */
export function NotificationGuideModalHost() {
  const { safeT } = useI18n();
  const [, bump] = useReducer((x) => x + 1, 0);

  useEffect(() => subscribeNotificationGuideBridge(bump), []);

  if (!isCapacitorNativePlatform()) {
    return null;
  }

  const pending = getNotificationGuidePending();
  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[126] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-notification-guide-title"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <p id="dibay-notification-guide-title" className={`${Sam.text.bodySecondary} leading-relaxed text-sam-fg`}>
          {safeT("dibay_notification_guide_settings_only_body", {
            fallbackKo: "알림을 허용하시겠습니까? 설정에서 알림을 켜 주세요.",
            fallbackEn: "Allow notifications? Turn them on in Settings.",
          })}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`}
            onClick={() => {
              void openNotificationSettings();
              settleNotificationGuideModal("open_settings");
            }}
          >
            {safeT("dibay_notification_guide_open_settings", {
              fallbackKo: "설정 열기",
              fallbackEn: "Open settings",
            })}
          </button>
          <button
            type="button"
            className={`${Sam.btn.ghostCombo} ${Sam.btn.block} min-h-[44px]`}
            onClick={() => settleNotificationGuideModal("later")}
          >
            {safeT("dibay_notification_guide_later", {
              fallbackKo: "나중에",
              fallbackEn: "Not now",
            })}
          </button>
        </div>
      </div>
    </div>
  );
}
