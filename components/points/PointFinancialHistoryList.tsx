"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointFinancialHistoryItem } from "@/lib/points/point-financial-history";
import { pointFinancialDayKey } from "@/lib/points/point-financial-history";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { CurrencyAmount } from "@/components/currency";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatMypageDate, mypageDateGroupKey } from "@/lib/mypage/format-mypage-date";
import type { MessageKey } from "@/lib/i18n/messages";
import { pointPromotionOrderStatusText } from "@/lib/points/point-label-i18n";
import {
  FINANCE_PUBLIC_PROCESSOR,
  financePaymentMethodDisplay,
  financeRefNo,
  financeTxNo,
  pointChargeStatusDisplay,
} from "@/lib/finance/finance-display-labels";

const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;

/** 부제 — 영어 화면에서 한글 원문(관리자 입력 사유 등)은 영어 부제가 있으면 그것을 쓴다 */
function pointItemSubtitle(item: PointFinancialHistoryItem, lang: AppLanguageCode): string {
  if (item.relatedObject?.missing) return lang === "en" ? "Deleted post" : "삭제된 게시물";
  const ko = item.subtitle ?? "";
  if (lang !== "en") return ko;
  if (item.subtitleEn) return item.subtitleEn;
  return HANGUL.test(ko) && item.adjustment == null ? "" : ko;
}

/** 줄 제목 — 번역 키 우선, 없으면 서버 기본 문구 (재감사 R8-b · 「상위노출」 번역 키를 화면이 쓰도록) */
function pointItemTitle(
  item: Pick<PointFinancialHistoryItem, "titleKey" | "fallbackTitleKo" | "fallbackTitleEn">,
  safeT: (key: MessageKey, fallbacks?: { fallbackKo?: string; fallbackEn?: string }) => string
): string {
  return safeT(item.titleKey as MessageKey, { fallbackKo: item.fallbackTitleKo, fallbackEn: item.fallbackTitleEn });
}

function formatRange(startAt: string, endAt: string, lang: AppLanguageCode): string {
  const s = formatMypageDate(startAt, { lang });
  const e = formatMypageDate(endAt, { lang });
  if (!s || !e) return "";
  return `${s} ~ ${e}`;
}

type Props = {
  items: PointFinancialHistoryItem[];
  loading?: boolean;
  emptyLabel?: string;
  onSelect?: (item: PointFinancialHistoryItem) => void;
  /** 날짜 묶음 기준 시간대 오프셋(분, Date#getTimezoneOffset). 생략 시 필리핀 시간(PHT) 달력 날짜. */
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

  const groups = useMemo(() => {
    const map = new Map<string, PointFinancialHistoryItem[]>();
    for (const item of items) {
      const key =
        typeof timeZoneOffsetMinutes === "number"
          ? pointFinancialDayKey(item.occurredAt, timeZoneOffsetMinutes)
          : mypageDateGroupKey(item.occurredAt, "day") || "unknown";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items, timeZoneOffsetMinutes]);

  if (loading) {
    return <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {emptyLabel ??
          safeT("point_fin_empty", {
            fallbackKo: "포인트 내역이 없습니다.",
            fallbackEn: "No Point history yet.",
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
              : formatMypageDate(`${day}T12:00:00+08:00`, { lang: language })}
          </h3>
          <ul className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface divide-y divide-sam-border-soft">
            {rows.map((item) => {
              const title = pointItemTitle(item, safeT);
              const promoLabel =
                language === "en"
                  ? item.promotion?.productLabelEn
                  : item.promotion?.productLabelKo;
              const range = item.promotion
                ? formatRange(item.promotion.startAt, item.promotion.endAt, language)
                : "";
              const relatedLabel = pointItemSubtitle(item, language);
              return (
                <li key={item.ledgerId}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    className="flex min-h-11 w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-sam-app"
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
                        {formatMypageDate(item.occurredAt, { style: "time", lang: language })}
                      </p>
                    </div>
                    <CurrencyAmount
                      currency="point"
                      amount={item.signedAmount}
                      compactPoint
                      signed
                      className="shrink-0 sam-text-body"
                    />
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
  if (!item) return null;
  const title = pointItemTitle(item, safeT);
  const promoLabel =
    language === "en" ? item.promotion?.productLabelEn : item.promotion?.productLabelKo;
  const subtitle = pointItemSubtitle(item, language);
  const txNo = financeTxNo("POINT", item.ledgerId);
  const method = item.deposit ? financePaymentMethodDisplay(item.deposit.paymentMethod) : null;
  const chargeStatus = item.deposit ? pointChargeStatusDisplay(item.deposit.requestStatus) : null;
  const chargeRef = item.deposit ? financeRefNo(item.deposit.chargeRequestId) : null;
  const label = (l: { key: MessageKey; ko: string; en: string }) =>
    safeT(l.key, { fallbackKo: l.ko, fallbackEn: l.en });

  return (
    <DibayBottomSheet open={Boolean(item)} onClose={onClose} title={title}>
      <CurrencyAmount
        currency="point"
        amount={item.signedAmount}
        compactPoint
        signed
        className="mb-4 text-[length:var(--overlay-title-1-size,20px)]"
      />
      <dl className={`space-y-2 ${OverlayUi.body}`}>
        <div className="flex justify-between gap-3">
          <dt className={OverlayUi.bodySecondary}>
            {safeT("point_fin_detail_time", { fallbackKo: "거래 일시", fallbackEn: "Time" })}
          </dt>
          <dd className="min-w-0 break-words text-right">{formatMypageDate(item.occurredAt, { style: "datetime", lang: language })}</dd>
        </div>
        {txNo ? (
          <div className="flex justify-between gap-3">
            <dt className={OverlayUi.bodySecondary}>
              {safeT("fin_detail_tx_no", { fallbackKo: "거래번호", fallbackEn: "Transaction no." })}
            </dt>
            <dd className="min-w-0 break-words text-right tabular-nums" data-point-fin-tx-no="1">{txNo}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className={OverlayUi.bodySecondary}>
            {safeT("point_fin_detail_balance", { fallbackKo: "이후 잔액", fallbackEn: "Balance after" })}
          </dt>
          <dd className="min-w-0 break-words text-right">
            <CurrencyAmount
              currency="point"
              amount={item.balanceAfter}
              compactPoint
              className="font-medium"
            />
          </dd>
        </div>
        {subtitle && !item.deposit && !item.adjustment ? (
          <div className="flex justify-between gap-3">
            <dt className={OverlayUi.bodySecondary}>
              {item.signedAmount < 0
                ? safeT("point_fin_detail_usage", { fallbackKo: "사용처", fallbackEn: "Usage" })
                : safeT("fin_detail_content", { fallbackKo: "내용", fallbackEn: "Details" })}
            </dt>
            <dd className="min-w-0 break-words text-right">{subtitle}</dd>
          </div>
        ) : null}
        {item.promotion ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("point_fin_detail_product", { fallbackKo: "상위노출 상품", fallbackEn: "Product" })}
              </dt>
              <dd className="min-w-0 break-words text-right">{promoLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("point_fin_detail_period", { fallbackKo: "상위노출 기간", fallbackEn: "Period" })}
              </dt>
              <dd className="min-w-0 break-words text-right">
                {formatRange(item.promotion.startAt, item.promotion.endAt, language)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("point_fin_detail_status", { fallbackKo: "상태", fallbackEn: "Status" })}
              </dt>
              <dd className="min-w-0 break-words text-right">{pointPromotionOrderStatusText(t, item.promotion.orderStatus)}</dd>
            </div>
          </>
        ) : null}
        {item.deposit ? (
          <>
            {method ? (
              <div className="flex justify-between gap-3">
                <dt className={OverlayUi.bodySecondary}>
                  {safeT("fin_detail_method", { fallbackKo: "결제 수단", fallbackEn: "Payment method" })}
                </dt>
                <dd className="min-w-0 break-words text-right">{label(method)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("fin_detail_charge_request", { fallbackKo: "충전 신청", fallbackEn: "Top-up request" })}
              </dt>
              <dd className="min-w-0 break-words text-right" data-point-fin-charge-ref="1">
                {[item.deposit.planName, chargeRef, chargeStatus ? label(chargeStatus) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
            {item.deposit.appleTxTail ? (
              <div className="flex justify-between gap-3">
                <dt className={OverlayUi.bodySecondary}>
                  {safeT("fin_detail_apple_tx", { fallbackKo: "Apple 거래", fallbackEn: "Apple transaction" })}
                </dt>
                <dd className="min-w-0 break-words text-right tabular-nums">{item.deposit.appleTxTail}</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {item.adjustment ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className={OverlayUi.bodySecondary}>
                {safeT("fin_detail_processor", { fallbackKo: "처리", fallbackEn: "Processed by" })}
              </dt>
              <dd className="min-w-0 break-words text-right">{label(FINANCE_PUBLIC_PROCESSOR)}</dd>
            </div>
            {item.adjustment.publicReason ? (
              <div className="flex justify-between gap-3">
                <dt className={OverlayUi.bodySecondary}>
                  {safeT("point_fin_detail_reason", { fallbackKo: "사유", fallbackEn: "Reason" })}
                </dt>
                <dd className="min-w-0 break-words text-right">{item.adjustment.publicReason}</dd>
              </div>
            ) : null}
          </>
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
