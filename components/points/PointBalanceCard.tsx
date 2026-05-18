"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface PointBalanceCardProps {
  balance: number;
  className?: string;
}

export function PointBalanceCard({ balance, className = "" }: PointBalanceCardProps) {
  const { t } = useI18n();

  return (
    <div
      className={`rounded-ui-rect border border-sam-border bg-sam-surface p-4 ${className}`}
    >
      <p className="sam-text-body-secondary text-sam-muted">{t("points_ui_owned_points")}</p>
      <p className="mt-1 sam-text-hero font-bold text-sam-fg">
        {balance.toLocaleString()}P
      </p>
    </div>
  );
}
