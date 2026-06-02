"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { DevicePermissionGuideKind } from "@/lib/permissions/device-permission-kind";
import { Sam } from "@/lib/ui/sam-component-classes";

const COPY: Record<
  DevicePermissionGuideKind,
  { title: MessageKey; body: MessageKey; primary: MessageKey; secondary: MessageKey }
> = {
  location: {
    title: "permission_guide_location_title",
    body: "permission_guide_location_body",
    primary: "permission_guide_allow",
    secondary: "permission_guide_later",
  },
  microphone: {
    title: "permission_guide_microphone_title",
    body: "permission_guide_microphone_body",
    primary: "permission_guide_allow",
    secondary: "permission_guide_later",
  },
  camera: {
    title: "permission_guide_camera_title",
    body: "permission_guide_camera_body",
    primary: "permission_guide_allow",
    secondary: "permission_guide_later",
  },
  notification: {
    title: "permission_guide_notification_title",
    body: "permission_guide_notification_body",
    primary: "permission_guide_allow",
    secondary: "permission_guide_later",
  },
  speaker: {
    title: "permission_guide_speaker_title",
    body: "permission_guide_speaker_body",
    primary: "permission_guide_speaker_primary",
    secondary: "permission_guide_later",
  },
};

export function PermissionGuideModal({
  kind,
  onLater,
  onPrimary,
}: {
  kind: DevicePermissionGuideKind;
  onLater: () => void;
  onPrimary: () => void;
}) {
  const { t } = useI18n();
  const c = COPY[kind];
  return (
    <div
      className="fixed inset-0 z-[126] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`dibay-perm-guide-${kind}`}
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <h2 id={`dibay-perm-guide-${kind}`} className={`${Sam.text.sectionTitle} text-sam-fg`}>
          {t(c.title)}
        </h2>
        <p className={`mt-3 ${Sam.text.bodySecondary} leading-relaxed text-sam-muted`}>{t(c.body)}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`} onClick={onPrimary}>
            {t(c.primary)}
          </button>
          <button type="button" className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[48px]`} onClick={onLater}>
            {t(c.secondary)}
          </button>
        </div>
      </div>
    </div>
  );
}
