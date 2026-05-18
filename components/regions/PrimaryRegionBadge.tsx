"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function PrimaryRegionBadge() {
  const { t } = useI18n();
  return (
    <span className="rounded bg-signature/15 px-1.5 py-0.5 sam-text-xxs font-medium text-signature">
      {t("ui_region_primary_badge")}
    </span>
  );
}
