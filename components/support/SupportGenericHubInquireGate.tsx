"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildGenericSupportTriageContext,
  type SupportAudience,
} from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { isSupportHubInquireDisabled } from "@/lib/support/support-owner-cta";

/**
 * PHASE 3-B: generic hub opens Support Modal START_CATEGORY (no OTHER invent).
 * 최종 감사 U-12 · 계약 §6: 사장님인데 매장이 없으면 버튼은 **비활성**으로 보인다(숨기지도, 누름을 조용히 버리지도 않음).
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
  const disabled = isSupportHubInquireDisabled(audience, storeId);

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
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (disabled) return;
          navigateToSupportCenter(
            buildGenericSupportTriageContext({
              audience,
              sourceSurface,
              storeId,
            })
          );
        }}
      >
        {safeT("support_enter_cta")}
      </button>
    </div>
  );
}
