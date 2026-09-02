"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildGenericSupportTriageContext,
  type SupportAudience,
} from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";

/**
 * PHASE 3-B: generic hub opens Support Modal START_CATEGORY (no OTHER invent).
 */
export function SupportGenericHubInquireGate({
  audience,
  sourceSurface,
  storeId,
  className,
  buttonClassName,
  inquireDataAttr,
}: {
  audience: SupportAudience;
  sourceSurface: string;
  storeId?: string;
  className?: string;
  buttonClassName: string;
  inquireDataAttr: "data-support-hub-inquire" | "data-owner-support-inquire";
}) {
  const { safeT } = useI18n();

  const inquireProps =
    inquireDataAttr === "data-support-hub-inquire"
      ? { "data-support-hub-inquire": "1" as const }
      : { "data-owner-support-inquire": "1" as const };

  return (
    <div className={className}>
      <button
        type="button"
        className={buttonClassName}
        {...inquireProps}
        data-support-generic-hub-open="1"
        onClick={() => {
          if (audience === "OWNER" && !storeId?.trim()) return;
          navigateToSupportCenter(
            buildGenericSupportTriageContext({
              audience,
              sourceSurface,
              storeId,
            })
          );
        }}
      >
        {safeT("support_enter_cta", {
          fallbackKo: "문의하기",
          fallbackEn: "Contact us",
        })}
      </button>
    </div>
  );
}
