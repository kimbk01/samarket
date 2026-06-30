"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { resolveOemGuide } from "@/lib/permissions/education/oem-guides";

type Props = {
  manufacturer?: string | null;
};

export function OEMGuideCard({ manufacturer }: Props) {
  const { safeT } = useI18n();
  const guide = resolveOemGuide(manufacturer);

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app/40 p-4">
      <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>
        {safeT(guide.titleKey, {
          fallbackKo: "기기별 설정 안내",
          fallbackEn: "Device-specific settings",
        })}
      </h3>
      <ol className={`mt-2 list-decimal space-y-2 pl-5 ${Sam.text.helper} text-sam-muted`}>
        {guide.steps.map((step) => (
          <li key={step.stepKey}>
            {safeT(step.stepKey, {
              fallbackKo: "설정에서 DIBAY 알림과 배터리 제한을 확인해 주세요.",
              fallbackEn: "Check DIBAY notifications and battery limits in Settings.",
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
