"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard } from "@/components/currency";

interface PointBalanceCardProps {
  /** null = 로딩 중·조회 실패 → "—". 음수는 그대로(회수 미정산 안내 표시). */
  balance: number | null;
  className?: string;
}

export function PointBalanceCard({ balance, className = "" }: PointBalanceCardProps) {
  const { t } = useI18n();

  return (
    <CurrencyBalanceCard
      currency="point"
      amount={balance}
      compactPoint
      className={className}
      footer={
        balance !== null && balance < 0 ? (
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("point_fin_negative_balance_note")}
        </p>
        ) : null
      }
    />
  );
}
