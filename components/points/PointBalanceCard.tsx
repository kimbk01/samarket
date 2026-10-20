"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard } from "@/components/currency";

interface PointBalanceCardProps {
  /** null = 로딩 중·조회 실패 → "—". 음수는 그대로(회수 미정산 안내 표시). */
  balance: number | null;
  className?: string;
}

/** 음수 잔액 = 위험색(S40 "음수 빨강") — 공용 카드는 건드리지 않고 금액 노드만 토큰으로 칠한다 */
export const POINT_BALANCE_NEGATIVE_CLASS = "[&_[data-currency-amount]]:!text-sam-danger";

export function PointBalanceCard({ balance, className = "" }: PointBalanceCardProps) {
  const { t } = useI18n();
  const negative = balance !== null && balance < 0;

  return (
    <CurrencyBalanceCard
      currency="point"
      amount={balance}
      compactPoint
      className={`${negative ? POINT_BALANCE_NEGATIVE_CLASS : ""} ${className}`.trim()}
      footer={
        negative ? (
        <p className="mt-2 sam-text-helper text-sam-danger" data-point-balance-negative="1">
          {t("point_fin_negative_balance_note")}
        </p>
        ) : null
      }
    />
  );
}
