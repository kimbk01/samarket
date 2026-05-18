"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MypageRouteLoading({ className = "sam-text-body text-sam-muted" }: { className?: string }) {
  const { t } = useI18n();
  return <p className={className}>{t("common_loading")}</p>;
}
