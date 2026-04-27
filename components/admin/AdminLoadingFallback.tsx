"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminLoadingFallback({ className }: { className?: string }) {
  const { t: tr } = useI18n();
  return <div className={className ?? "p-4 text-sam-muted"}>{tr("common_loading")}</div>;
}

export function AdminLoadingFallbackSm({ className }: { className?: string }) {
  const { t: tr } = useI18n();
  return <p className={className ?? "text-sm text-sam-muted"}>{tr("common_loading")}</p>;
}
