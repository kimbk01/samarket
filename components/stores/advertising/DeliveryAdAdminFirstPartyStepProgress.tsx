"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DELIVERY_AD_ADMIN_FIRST_PARTY_STEPS } from "@/lib/stores/advertising/delivery-ad-design-board-contract";

export function DeliveryAdAdminFirstPartyStepProgress({
  activeStep,
}: {
  activeStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}) {
  const { safeT } = useI18n();
  const fallbacks: Record<number, { ko: string; en: string }> = {
    1: { ko: "도메인", en: "Domain" },
    2: { ko: "상품", en: "Product" },
    3: { ko: "위치", en: "Placement" },
    4: { ko: "Creative", en: "Creative" },
    5: { ko: "기간", en: "Schedule" },
    6: { ko: "Preview", en: "Preview" },
    7: { ko: "완료", en: "Publish" },
  };
  return (
    <ol
      className="flex gap-1 overflow-x-auto pb-1"
      data-admin-first-party-step-progress="design-board"
    >
      {DELIVERY_AD_ADMIN_FIRST_PARTY_STEPS.map(({ step, labelKey }) => {
        const active = step === activeStep;
        const done = step < activeStep;
        const fb = fallbacks[step] ?? { ko: String(step), en: String(step) };
        return (
          <li
            key={step}
            className={`flex min-w-[4rem] flex-1 flex-col items-center rounded-ui-rect px-1 py-2 text-center ${
              active
                ? "bg-[#0A823E]/10 text-[#0A823E]"
                : done
                  ? "bg-[#F5F5F5] text-[#757575]"
                  : "bg-[#F5F5F5] text-[#BDBDBD]"
            }`}
            data-admin-first-party-step={step}
          >
            <span className="text-[10px] font-bold tabular-nums">{step}</span>
            <span className="mt-0.5 text-[10px] font-medium leading-tight">
              {safeT(labelKey as never, { fallbackKo: fb.ko, fallbackEn: fb.en })}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
