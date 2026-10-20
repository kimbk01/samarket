"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import type { PointExpireUpcomingSummary } from "@/lib/types/point-expire";

interface PointExpiringCardProps {
  summary: Pick<PointExpireUpcomingSummary, "totalExpiringPoint" | "nearestExpireAt">;
  className?: string;
  /** 지정 시 카드 전체가 링크(다른 화면에서 S42 진입). 소멸 예정 화면 자체에서는 생략 */
  href?: string;
}

/**
 * 소멸 예정 합계 카드 (S42) — 총액 · 가장 빠른 소멸일(필리핀 시간 표시).
 * 0 이어도 숨기지 않는다 — 빈 상태는 화면(`MyStateView`)이 정한다.
 */
export function PointExpiringCard({ summary, className = "", href }: PointExpiringCardProps) {
  const { t, language } = useI18n();

  const body = (
    <>
      <p className="sam-text-body-secondary text-sam-muted">{t("points_ui_expiring_label")}</p>
      <CurrencyAmount
        currency="point"
        amount={summary.totalExpiringPoint}
        compactPoint
        className="mt-1 sam-text-page-title"
      />
      {summary.nearestExpireAt ? (
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("points_ui_nearest_expire")} {formatMypageDate(summary.nearestExpireAt, { lang: language })}
        </p>
      ) : null}
      {href ? <p className="currency-amount--point mt-2 sam-text-helper">{t("points_ui_view_details")}</p> : null}
    </>
  );

  const cls = `currency-card--point block rounded-ui-rect border p-4 ${className}`;
  return href ? (
    <Link href={href} className={cls} data-point-expiring-card="1">
      {body}
    </Link>
  ) : (
    <section className={cls} data-point-expiring-card="1">
      {body}
    </section>
  );
}
