"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointFinancialHistoryItem } from "@/lib/points/point-financial-history";
import { pointFinancialDayKey } from "@/lib/points/point-financial-history";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

function formatSignedAmount(signed: number): string {
  const abs = Math.abs(signed).toLocaleString();
  return signed < 0 ? `-${abs} P` : `+${abs} P`;
}

function formatRange(startAt: string, endAt: string, locale: string): string {
  const s = startAt ? new Date(startAt) : null;
  const e = endAt ? new Date(endAt) : null;
  if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { month: "2-digit", day: "2-digit" };
  return `${s.toLocaleDateString(locale, opts)} ~ ${e.toLocaleDateString(locale, opts)}`;
}

type Props = {
  items: PointFinancialHistoryItem[];
  loading?: boolean;
  emptyLabel?: string;
  onSelect?: (item: PointFinancialHistoryItem) => void;
  /** Viewer timezone offset minutes (Date#getTimezoneOffset). */
  timeZoneOffsetMinutes?: number;
};

export function PointFinancialHistoryList({
  items,
  loading,
  emptyLabel,
  onSelect,
  timeZoneOffsetMinutes,
}: Props) {
  const { t, language, safeT } = useI18n();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const offset =
    typeof timeZoneOffsetMinutes === "number"
      ? timeZoneOffsetMinutes
      : typeof Date !== "undefined"
        ? new Date().getTimezoneOffset()
        : 0;

  const groups = useMemo(() => {
    const map = new Map<string, PointFinancialHistoryItem[]>();
    for (const item of items) {
      const key = pointFinancialDayKey(item.occurredAt, offset);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items, offset]);

  if (loading) {
    return <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {emptyLabel ??
          safeT("point_fin_empty", {
            fallbackKo: "D-Point 내역이 없습니다.",
            fallbackEn: "No D-Point history yet.",
          })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(([day, rows]) => (
        <section key={day}>
          <h3 className="mb-2 px-1 sam-text-helper font-semibold text-sam-muted">
            {day === "unknown"
              ? "—"
              : new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
          </h3>
          <ul className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface divide-y divide-sam-border-soft">
            {rows.map((item) => {
              const title =
                language === "en" ? item.fallbackTitleEn : item.fallbackTitleKo;
              const promoLabel =
                language === "en"
                  ? item.promotion?.productLabelEn
                  : item.promotion?.productLabelKo;
              const range = item.promotion
                ? formatRange(item.promotion.startAt, item.promotion.endAt, locale)
                : "";
              const relatedLabel =
                item.relatedObject?.missing && language === "en"
                  ? "Deleted post"
                  : item.relatedObject?.missing
                    ? "삭제된 게시물"
                    : item.subtitle;
              return (
                <li key={item.ledgerId}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-sam-app"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="sam-text-body font-semibold text-sam-fg">{title}</p>
                      {relatedLabel ? (
                        <p className="mt-0.5 line-clamp-2 sam-text-body-secondary text-sam-muted">
                          {relatedLabel}
                        </p>
                      ) : null}
                      {item.promotion ? (
                        <p className="mt-0.5 sam-text-helper text-sam-meta">
                          {[promoLabel, range].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      <p className="mt-1 sam-text-helper text-sam-meta">
                        {new Date(item.occurredAt).toLocaleString(locale, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 sam-text-body font-bold ${
                        item.direction === "credit" ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {formatSignedAmount(item.signedAmount)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

type SheetProps = {
  item: PointFinancialHistoryItem | null;
  onClose: () => void;
};

export function PointFinancialDetailSheet({ item, onClose }: SheetProps) {
  const { language, safeT, t } = useI18n();
  const locale = language === "en" ? "en-US" : "ko-KR";
  if (!item) return null;
  const title = language === "en" ? item.fallbackTitleEn : item.fallbackTitleKo;
  const promoLabel =
    language === "en" ? item.promotion?.productLabelEn : item.promotion?.productLabelKo;

  return (
    <DibayBottomSheet open={Boolean(item)} onClose={onClose} title={title} anchor="above-bottom-nav">
      <p
        className={`mb-4 text-[length:var(--overlay-title-1-size,20px)] font-bold ${
          item.direction === "credit" ? "text-emerald-700" : "text-[color:var(--overlay-danger)]"
        }`}
      >
        {formatSignedAmount(item.signedAmount)}
      </p>
      <dl className={`space-y-2 ${OverlayUi.body}`}>
        <div className="flex justify-between gap-3">
          <dt className={OverlayUi.bodySecondary}>
            {safeT("point_fin_detail_time", { fallbackKo: "거래 일시", fallbackEn: "Time" })}
          </dt>
          <dd>{new Date(item.occurredAt).toLocaleString(locale)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className={OverlayUi.bodySecondary}>
            {safeT("point_fin_detail_balance", { fallbackKo: "이후 잔액", fallbackEn: "Balance after" })}
          </dt>
          <dd>{item.balanceAfter.toLocaleString()}P</dd>
        </div>
        {item.subtitle ? (
          <div className="flex justify-between gap-3">
            <dt className={OverlayUi.bodySecondary}>
              {safeT("point_fin_detail_usage", { fallbackKo: "사용처", fallbackEn: "Usage" })}
            </dt>
            <dd className="text-right">{item.subtitle}</dd>
          </div>
        ) : null}
        {item.promotion ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("point_fin_detail_product", { fallbackKo: "홍보 상품", fallbackEn: "Product" })}
              </dt>
              <dd>{promoLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("point_fin_detail_period", { fallbackKo: "홍보 기간", fallbackEn: "Period" })}
              </dt>
              <dd className="text-right">
                {formatRange(item.promotion.startAt, item.promotion.endAt, locale)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("point_fin_detail_status", { fallbackKo: "상태", fallbackEn: "Status" })}
              </dt>
              <dd>{item.promotion.orderStatus}</dd>
            </div>
          </>
        ) : null}
        {item.deposit ? (
          <div className="flex justify-between gap-3">
            <dt className={OverlayUi.bodySecondary}>
              {safeT("point_fin_detail_deposit", { fallbackKo: "입금", fallbackEn: "Deposit" })}
            </dt>
            <dd className="text-right">{item.deposit.planName || item.deposit.requestStatus}</dd>
          </div>
        ) : null}
        {item.adjustment?.reason ? (
          <div className="flex justify-between gap-3">
            <dt className={OverlayUi.bodySecondary}>
              {safeT("point_fin_detail_reason", { fallbackKo: "사유", fallbackEn: "Reason" })}
            </dt>
            <dd className="text-right">{item.adjustment.reason}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-6">
        <DibayOverlayButton roleTone="secondary" type="button" onClick={onClose} className="w-full">
          {t("common_confirm")}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}

/** Convenience stateful wrapper for list + sheet */
export function PointFinancialHistoryPanel({
  items,
  loading,
  emptyLabel,
}: {
  items: PointFinancialHistoryItem[];
  loading?: boolean;
  emptyLabel?: string;
}) {
  const [selected, setSelected] = useState<PointFinancialHistoryItem | null>(null);
  return (
    <>
      <PointFinancialHistoryList
        items={items}
        loading={loading}
        emptyLabel={emptyLabel}
        onSelect={setSelected}
      />
      <PointFinancialDetailSheet item={selected} onClose={() => setSelected(null)} />
    </>
  );
}
