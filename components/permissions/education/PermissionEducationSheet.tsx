"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { openNativeCallPermissionSettings } from "@/lib/call/native/native-call-permissions";
import {
  openBatteryOptimizationSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { resolvePermissionEducationCopy } from "@/lib/permissions/education/permission-education-copy";
import {
  shouldShowBrowserMediaHelp,
  shouldShowNativeSettingsCta,
  shouldShowOemGuide,
} from "@/lib/permissions/education/permission-education-sheet-ui";
import { supportsPermissionEducationContext } from "@/lib/permissions/education/permission-education-platform";
import { OEMGuideCard } from "@/components/permissions/education/OEMGuideCard";
import type { PermissionEducationContext } from "@/lib/permissions/education/permission-education-types";
import type { PermissionCapabilitySummary } from "@/lib/permissions/education/permission-education-types";
import type { PermissionEducationSettingsOpens } from "@/lib/permissions/education/permission-education-copy";

type Props = {
  context: PermissionEducationContext;
  summary?: PermissionCapabilitySummary;
  onAllow: () => void;
  onLater: () => void;
  onSettingsOpened: () => void;
};

async function openSettingsForCopy(settingsOpens: PermissionEducationSettingsOpens): Promise<void> {
  if (settingsOpens === "call_media") {
    await openNativeCallPermissionSettings();
    return;
  }
  if (settingsOpens === "fsi") {
    await openFullScreenIntentSettings();
    return;
  }
  if (settingsOpens === "battery") {
    await openBatteryOptimizationSettings();
    return;
  }
  if (settingsOpens === "notification") {
    await openNotificationSettings();
  }
}

export function PermissionEducationSheet({
  context,
  summary,
  onAllow,
  onLater,
  onSettingsOpened,
}: Props) {
  const { safeT } = useI18n();

  if (!supportsPermissionEducationContext(context)) {
    return null;
  }

  const copy = resolvePermissionEducationCopy(context);
  const showNativeSettings = shouldShowNativeSettingsCta(copy);
  const showOem = shouldShowOemGuide(copy);
  const showBrowserHelp = shouldShowBrowserMediaHelp(copy);

  return (
    <div
      className="fixed inset-0 z-[128] flex items-end justify-center bg-black/45 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-ui-rect bg-sam-surface p-5 shadow-xl sm:rounded-ui-rect">
        <h2 className={`${Sam.text.sectionTitle} text-sam-fg`}>
          {safeT(copy.titleKey, {
            fallbackKo: "권한이 필요합니다",
            fallbackEn: "Permission needed",
          })}
        </h2>
        <p className={`mt-3 ${Sam.text.bodySecondary} leading-relaxed text-sam-muted`}>
          {safeT(copy.bodyKey, {
            fallbackKo: "이 기능을 사용하려면 설정이 필요합니다.",
            fallbackEn: "Settings are required to use this feature.",
          })}
        </p>
        <p className={`mt-2 ${Sam.text.body} text-sam-fg`}>
          {safeT(copy.benefitKey, {
            fallbackKo: "허용하면 바로 사용할 수 있습니다.",
            fallbackEn: "You can use this right away after allowing.",
          })}
        </p>
        {copy.deniedKey ? (
          <p className={`mt-2 ${Sam.text.helper} text-sam-muted`}>
            {safeT(copy.deniedKey, {
              fallbackKo: "거부하면 일부 통화 기능이 제한됩니다.",
              fallbackEn: "If denied, some call features are limited.",
            })}
          </p>
        ) : null}
        {showBrowserHelp && copy.browserHelpKey ? (
          <p className={`mt-2 ${Sam.text.helper} text-sam-muted`}>
            {safeT(copy.browserHelpKey, {
              fallbackKo:
                "브라우저 주소창 왼쪽 자물쇠(또는 사이트 정보)에서 마이크·카메라 권한을 허용해 주세요.",
              fallbackEn:
                "Allow microphone and camera for this site via the lock or site-info icon in the address bar.",
            })}
          </p>
        ) : null}
        {showOem ? (
          <div className="mt-4">
            <OEMGuideCard manufacturer={summary?.manufacturer} />
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`} onClick={onAllow}>
            {safeT("perm_edu_cta_allow", {
              fallbackKo: "계속",
              fallbackEn: "Continue",
            })}
          </button>
          {showNativeSettings ? (
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[44px]`}
              onClick={() => {
                void openSettingsForCopy(copy.settingsOpens).then(onSettingsOpened);
              }}
            >
              {safeT("perm_edu_cta_settings", {
                fallbackKo: "설정 열기",
                fallbackEn: "Open settings",
              })}
            </button>
          ) : null}
          <button type="button" className={`${Sam.btn.ghostCombo} ${Sam.btn.block} min-h-[44px]`} onClick={onLater}>
            {safeT("perm_edu_cta_later", {
              fallbackKo: "나중에",
              fallbackEn: "Not now",
            })}
          </button>
        </div>
      </div>
    </div>
  );
}
