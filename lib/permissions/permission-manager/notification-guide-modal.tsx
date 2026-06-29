"use client";

import { useEffect, useReducer } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  getNotificationGuidePending,
  settleNotificationGuideModal,
  subscribeNotificationGuideBridge,
} from "@/lib/permissions/permission-manager/notification-permission-ui-bridge";
import type { NotificationReceiveSnapshot } from "@/lib/permissions/permission-manager/notification-permission-types";
import {
  isSamsungDevice,
  openBatteryOptimizationSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from "@/lib/permissions/permission-manager/notification-permission-manager";

function showSettingsOnly(snapshot: NotificationReceiveSnapshot): boolean {
  return (
    snapshot.effectiveState === "PERMANENT_DENIED" ||
    snapshot.effectiveState === "SYSTEM_DISABLED" ||
    snapshot.notificationRuntimePermission
  );
}

function showFsiCta(snapshot: NotificationReceiveSnapshot): boolean {
  return !snapshot.fullScreenIntentEnabled;
}

function showBatteryCta(snapshot: NotificationReceiveSnapshot, samsung: boolean): boolean {
  return samsung || snapshot.batteryUnrestrictedOrUnknown === "restricted";
}

/**
 * Global notification permission guide — first login, resume when OFF, settings retry.
 */
export function NotificationGuideModalHost() {
  const { safeT } = useI18n();
  const [, bump] = useReducer((x) => x + 1, 0);

  useEffect(() => subscribeNotificationGuideBridge(bump), []);

  const pending = getNotificationGuidePending();
  if (!pending) return null;

  const { mode, snapshot } = pending;
  const settingsOnly = showSettingsOnly(snapshot);
  const samsung = isSamsungDevice(snapshot);
  const titleKey =
    mode === "first_login"
      ? "dibay_notification_guide_first_login_title"
      : "dibay_notification_guide_disabled_title";
  const bodyKey =
    mode === "first_login"
      ? "dibay_notification_guide_first_login_body"
      : "dibay_notification_guide_disabled_body";

  return (
    <div
      className="fixed inset-0 z-[126] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-notification-guide-title"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <h2 id="dibay-notification-guide-title" className={`${Sam.text.sectionTitle} text-sam-fg`}>
          {safeT(titleKey, {
            fallbackKo: "알림을 켜 주세요",
            fallbackEn: "Turn on notifications",
          })}
        </h2>
        <p className={`mt-3 ${Sam.text.bodySecondary} leading-relaxed text-sam-muted`}>
          {safeT(bodyKey, {
            fallbackKo: "채팅·통화·주문 알림과 수신 전화를 받으려면 알림 허용이 필요합니다.",
            fallbackEn: "Allow notifications to receive chats, calls, orders, and incoming calls.",
          })}
        </p>
        {samsung ? (
          <p className={`mt-2 ${Sam.text.helper} text-sam-muted`}>
            {safeT("dibay_notification_guide_samsung_hint", {
              fallbackKo:
                "삼성 기기에서는 설정 > 알림에서 앱 알림·수신 통화 채널·배터리 사용 제한도 확인해 주세요.",
              fallbackEn:
                "On Samsung devices, also check app notifications, incoming call channel, and battery restrictions in Settings.",
            })}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          {settingsOnly ? (
            <button
              type="button"
              className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`}
              onClick={() => {
                void openNotificationSettings();
                settleNotificationGuideModal("open_settings");
              }}
            >
              {safeT("dibay_notification_guide_open_settings", {
                fallbackKo: "알림 설정 열기",
                fallbackEn: "Open notification settings",
              })}
            </button>
          ) : (
            <button
              type="button"
              className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`}
              onClick={() => settleNotificationGuideModal("allow")}
            >
              {safeT("dibay_notification_guide_allow", {
                fallbackKo: "알림 허용",
                fallbackEn: "Allow notifications",
              })}
            </button>
          )}
          {showFsiCta(snapshot) ? (
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[44px]`}
              onClick={() => {
                void openFullScreenIntentSettings();
              }}
            >
              {safeT("dibay_notification_guide_open_fsi", {
                fallbackKo: "전체 화면 알림 설정",
                fallbackEn: "Full-screen alert settings",
              })}
            </button>
          ) : null}
          {showBatteryCta(snapshot, samsung) ? (
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[44px]`}
              onClick={() => {
                void openBatteryOptimizationSettings();
              }}
            >
              {safeT("dibay_notification_guide_open_battery", {
                fallbackKo: "배터리 설정 열기",
                fallbackEn: "Open battery settings",
              })}
            </button>
          ) : null}
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
