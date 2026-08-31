"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DELIVERY_AD_DESIGN_BOARD,
  DELIVERY_AD_OWNER_APPLICATION_STEPS,
} from "@/lib/stores/advertising/delivery-ad-design-board-contract";

export function DeliveryAdOwnerStepProgress({ activeStep }: { activeStep: 1 | 2 | 3 | 4 | 5 }) {
  const { t } = useI18n();
  return (
    <ol
      className="flex gap-1 overflow-x-auto pb-1"
      data-owner-ads-step-progress="design-board"
      aria-label={t("owner_ads_application_progress_aria")}
    >
      {DELIVERY_AD_OWNER_APPLICATION_STEPS.map(({ step, labelKey }) => {
        const active = step === activeStep;
        const done = step < activeStep;
        return (
          <li
            key={step}
            className={`flex min-w-[4.5rem] flex-1 flex-col items-center rounded-ui-rect px-1 py-2 text-center ${
              active
                ? "bg-[#0A823E]/10 text-[#0A823E]"
                : done
                  ? "bg-[#F5F5F5] text-[#757575]"
                  : "bg-[#F5F5F5] text-[#BDBDBD]"
            }`}
            data-owner-ads-step={step}
            data-owner-ads-step-state={active ? "active" : done ? "done" : "pending"}
          >
            <span className="text-[10px] font-bold tabular-nums">{step}</span>
            <span className="mt-0.5 text-[10px] font-medium leading-tight">{t(labelKey)}</span>
          </li>
        );
      })}
    </ol>
  );
}

void DELIVERY_AD_DESIGN_BOARD;
