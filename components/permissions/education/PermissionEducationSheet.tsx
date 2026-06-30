"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { openNativeCallPermissionSettings } from "@/lib/call/native/native-call-permissions";
import { resolvePermissionEducationCopy } from "@/lib/permissions/education/permission-education-copy";
import {
  shouldShowBrowserMediaHelp,
  shouldShowNativeSettingsCta,
} from "@/lib/permissions/education/permission-education-sheet-ui";
import { supportsPermissionEducationContext } from "@/lib/permissions/education/permission-education-platform";
import type { PermissionEducationContext } from "@/lib/permissions/education/permission-education-types";

type Props = {
  context: PermissionEducationContext;
  onLater: () => void;
  onSettingsOpened: () => void;
};

export function PermissionEducationSheet({ context, onLater, onSettingsOpened }: Props) {
  const { safeT } = useI18n();

  if (!supportsPermissionEducationContext(context)) {
    return null;
  }

  const copy = resolvePermissionEducationCopy(context);
  const showNativeSettings = shouldShowNativeSettingsCta(copy);
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
            fallbackKo: "설정에서 권한을 허용해 주세요.",
            fallbackEn: "Allow the permission in Settings.",
          })}
        </p>
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
        <div className="mt-6 flex flex-col gap-2">
          {showNativeSettings ? (
            <button
              type="button"
              className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`}
              onClick={() => {
                void openNativeCallPermissionSettings().then(onSettingsOpened);
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
