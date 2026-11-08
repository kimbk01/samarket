"use client";

import { Megaphone } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { CurrencyAmount } from "@/components/currency";
import { formatMypageDate, formatMypageNumber, formatMypagePoint } from "@/lib/mypage/format-mypage-date";
import type { PromotionOrderPeriodSummary } from "@/lib/points/promotion-order-history";
import { pointPromotionOrderStatusText } from "@/lib/points/point-label-i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointPromotionOrder, PointPromotionPlacement } from "@/lib/types/point";
import { translateBy } from "@/lib/i18n/translate-by";


const PLACEMENT_KEYS: Record<PointPromotionPlacement, MessageKey> = {
  home_top: "point_placement_home_top",
  home_middle: "point_placement_home_middle",
  search_top: "point_placement_search_top",
  shop_featured: "point_placement_shop_featured",
  feed_boost: "point_placement_feed_boost",
  community_top_pin: "point_placement_community_top_pin",
};

interface PointPromotionOrderListProps {
  orders: PointPromotionOrder[];
}

const STATUS_CLASS: Record<PointPromotionOrder["orderStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  pending_review: "bg-sam-surface-muted text-sam-fg",
  active: "bg-signature/10 text-signature",
  expired: "bg-sam-border-soft text-sam-muted",
  ended: "bg-sam-border-soft text-sam-muted",
  rejected: "bg-sam-border-soft text-sam-muted",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function PointPromotionOrderList({ orders }: PointPromotionOrderListProps) {
  const { t, language } = useI18n();

  if (orders.length === 0) {
    return (
      <MyStateView
        kind="empty"
        empty={{ icon: <Megaphone className="h-6 w-6" aria-hidden />, title: t("mypage_oa_promotions_empty") }}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li
          key={o.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <p className="font-medium text-sam-fg">{o.targetTitle}</p>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            {t(PLACEMENT_KEYS[o.placement])} · {t("points_ui_days", { days: o.durationDays })}
          </p>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            {t("points_ui_promo_cost", { cost: formatMypageNumber(o.pointCost, { lang: language }) })}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[o.orderStatus]}`}
          >
            {pointPromotionOrderStatusText(t, o.orderStatus)}
          </span>
          {/* 신청 시각까지 PHT (C-5) */}
          <p className="mt-1 sam-text-helper text-sam-meta tabular-nums" data-testid="promotion-order-created-at">
            {formatMypageDate(o.createdAt, { style: "datetime", lang: language })}
          </p>
        </li>
      ))}
    </ul>
  );
}

type Lang = "ko" | "en";
const pick = (lang: Lang, ko: string, en: string) => (lang === "en" ? en : ko);


/**
 * 기간 합계 (C-5) — 신청 n건 · 포인트 합계 · 상태별. 숫자는 서버가 기간 **전체**로 계산한 값(현재 쪽 합계 아님).
 */
export function PromotionOrderPeriodSummaryCard({
  summary,
  error,
}: {
  summary: PromotionOrderPeriodSummary | null;
  error?: boolean;
}) {
  const { t, language } = useI18n();
  const lang: Lang = language === "en" ? "en" : "ko";
  if (!summary) {
    return error ? (
      <p className="sam-text-helper text-sam-danger" role="alert">
        {translateBy(lang, "points_could_not_load_the_period_totals")}
      </p>
    ) : null;
  }
  const countText = (n: number) => pick(lang, `${formatMypageNumber(n, { lang: language })}건`, `${formatMypageNumber(n, { lang: language })}`);
  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      data-testid="promotion-orders-period-summary"
    >
      <p className="mb-1 sam-text-xxs text-sam-muted">{translateBy(lang, "points_by_request_date")}</p>
      <div className="grid grid-cols-2 gap-2">
        <div data-testid="pos-count">
          <p className="sam-text-helper text-sam-muted">{translateBy(lang, "points_requests")}</p>
          <p className="sam-text-body tabular-nums text-sam-fg">{countText(summary.count)}</p>
        </div>
        <div data-testid="pos-point">
          <p className="sam-text-helper text-sam-muted">{translateBy(lang, "points_points_spent")}</p>
          <CurrencyAmount currency="point" amount={summary.pointCost} compactPoint className="sam-text-body" />
        </div>
      </div>
      {summary.byStatus.length > 0 ? (
        <dl className="mt-2 grid grid-cols-1 gap-1 sam-text-helper" data-testid="pos-by-status">
          {summary.byStatus.map((s) => (
            <div key={s.status} className="flex justify-between gap-2">
              <dt className="text-sam-muted">{pointPromotionOrderStatusText(t, s.status)}</dt>
              <dd className="text-right tabular-nums text-sam-fg">
                {countText(s.count)} · {formatMypagePoint(s.pointCost, { lang: language })}
              </dd>
            </div>
          ))}
          {summary.refundPoints > 0 ? (
            <div className="flex justify-between gap-2" data-testid="pos-refund">
              <dt className="text-sam-muted">{translateBy(lang, "points_points_refunded")}</dt>
              <dd className="text-right tabular-nums text-sam-fg">{formatMypagePoint(summary.refundPoints, { lang: language })}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
