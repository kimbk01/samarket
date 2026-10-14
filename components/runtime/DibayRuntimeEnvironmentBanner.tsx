"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { DibayRuntimeBannerVariant } from "@/lib/config/resolve-runtime-banner-variant";

export type { DibayRuntimeBannerVariant };

/**
 * Client-visible environment strip. Variant comes from the server layout
 * so Production consumer UI stays clean unless miswired or TEST surface.
 */
export function DibayRuntimeEnvironmentBanner({
  variant,
  projectRefHint,
}: {
  variant: DibayRuntimeBannerVariant;
  /** Short project ref for operators — never a secret */
  projectRefHint?: string | null;
}) {
  const { safeT } = useI18n();
  if (variant === "hidden") return null;

  if (variant === "miswired") {
    return (
      <div
        role="status"
        className="sticky top-0 z-[100] w-full bg-red-700 px-3 py-1.5 text-center text-xs font-semibold text-white"
        data-dibay-runtime-banner="miswired"
      >
        {safeT("runtime_env_banner_miswired", {
          fallbackKo: "위험: 비운영 배포가 운영 DB에 연결되어 있습니다. 쓰기·발송이 차단됩니다.",
          fallbackEn:
            "Danger: non-production deploy is wired to the production database. Writes and outbound sends are blocked.",
        })}
      </div>
    );
  }

  if (variant === "test") {
    const ref = projectRefHint?.trim() ? ` · ${projectRefHint.trim()}` : "";
    return (
      <div
        role="status"
        className="sticky top-0 z-[100] w-full bg-amber-600 px-3 py-1.5 text-center text-xs font-semibold text-white"
        data-dibay-runtime-banner="test"
      >
        {safeT("runtime_env_banner_test", {
          fallbackKo: "TEST 환경 — 운영 데이터가 아닙니다",
          fallbackEn: "TEST environment — not production data",
        })}
        {ref}
      </div>
    );
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] w-full border-b border-sam-border bg-sam-surface px-3 py-1 text-center text-[11px] font-medium text-sam-muted"
      data-dibay-runtime-banner="production"
    >
      {safeT("runtime_env_banner_production", {
        fallbackKo: "PRODUCTION",
        fallbackEn: "PRODUCTION",
      })}
      {projectRefHint?.trim() ? ` · ${projectRefHint.trim()}` : ""}
    </div>
  );
}
