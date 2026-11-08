"use client";

/**
 * P0-5 — Coin → Cash 전환 (사장님).
 * - 정책·한도·잔액·전후 값·미납 수수료 정산·실제 Cash 증가액은 모두 서버 미리보기(DB-2 preview_store_coin_conversion) 값만 쓴다.
 *   화면에서 잔액을 빼거나 더하지 않는다 (「Coin 0 → −1」 같은 값이 나올 수 없음).
 * - 막힘 사유가 있으면 확인창을 열지 않고 정확한 사유를 보여 준다.
 * - 미리보기는 실행 보증이 아니다 — 실제 전환 RPC 가 트랜잭션 안에서 다시 검사하고, 그 오류도 사유별로 보여 준다.
 */

import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import { STORE_MONEY_OUTCOME_KINDS } from "@/lib/notifications/money-outcome-signal";
import { useCallback, useEffect, useState } from "react";
import { formatCashPhp2 } from "@/lib/currency/currency-display-contract";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { Sam } from "@/lib/ui/css-vars";
import { OWNER_FORM_ACTION_ROW_CLASS, OWNER_FORM_INPUT_GROW_CLASS, OwnerCta } from "@/lib/business/owner-cta-classes";
import { COIN_TO_CASH_LABEL_KO, COIN_WITHDRAWAL_LABEL_KO } from "@/lib/finance/product-decision-lock";
import { newOwnerFormRequestKey } from "@/lib/business/owner-form-request-key";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { BusinessCashConversionQuote } from "@/lib/stores/advertising/canonical-business-cash-contract";
import { translateBy } from "@/lib/i18n/translate-by";

type Quote = BusinessCashConversionQuote;

/** 전환 막힘 사유 / 전환 RPC 오류 코드 → 사장님 문구. 같은 코드는 미리보기·실행에서 같은 문구. */
export function ownerCoinConvertReason(
  code: string,
  language: string,
  ctx: { minimumCoin?: number | null; conversionUnit?: number | null; available?: number | null; quote?: Quote | null }
): string {
  const q = ctx.quote ?? null;
  const min = ctx.minimumCoin ?? q?.minimumCoin ?? null;
  const unit = ctx.conversionUnit ?? q?.conversionUnit ?? null;
  const c = (ko: string, en: string) => ownerUiCopy(language, ko, en);
  switch (code) {
    case "conversion_disabled":
      return c("지금은 Coin 전환이 중지되어 있습니다.", "Coin conversion is paused right now.");
    case "amount_required":
    case "invalid_input":
      return c("전환할 Coin을 입력해 주세요.", "Enter Coin to convert.");
    case "below_minimum":
      return c(`한 번에 최소 ${min ?? "-"} Coin부터 전환할 수 있습니다.`, `Minimum ${min ?? "-"} Coin per conversion.`);
    case "invalid_unit":
      return c(`${unit ?? "-"} Coin 단위로만 전환할 수 있습니다.`, `Convert in multiples of ${unit ?? "-"} Coin.`);
    case "daily_count_limit":
      return c("오늘 전환 가능 횟수를 모두 사용했습니다.", "Today's conversion count limit is reached.");
    case "weekly_count_limit":
      return c("이번 주 전환 가능 횟수를 모두 사용했습니다.", "This week's conversion count limit is reached.");
    case "monthly_count_limit":
      return c("이번 달 전환 가능 횟수를 모두 사용했습니다.", "This month's conversion count limit is reached.");
    case "daily_coin_limit":
      return c("오늘 전환 가능한 Coin 한도를 넘습니다.", "Exceeds today's Coin conversion limit.");
    case "monthly_coin_limit":
      return c("이번 달 전환 가능한 Coin 한도를 넘습니다.", "Exceeds this month's Coin conversion limit.");
    case "interval_limit":
      return c("직전 전환 후 정해진 시간이 지나야 다시 전환할 수 있습니다.", "Wait for the minimum interval since the last conversion.");
    case "insufficient_store_points": {
      const have = ctx.available ?? q?.storePointsBalance ?? null;
      return c(
        `보유 Coin이 부족합니다${have == null ? "" : ` (보유 ${have.toLocaleString()} Coin)`}.`,
        `Not enough Coin${have == null ? "" : ` (balance ${have.toLocaleString()} Coin)`}.`
      );
    }
    case "credit_zero":
      return c("이 수량으로는 받을 Cash가 ₱0.00 입니다. 수량을 늘려 주세요.", "This amount converts to ₱0.00 Cash. Increase the amount.");
    case "stale_rate":
      return c("전환율이 바뀌었습니다. 새 전환율로 다시 미리보기한 뒤 확인해 주세요.", "The rate changed. Preview again with the new rate.");
    case "rate_missing":
    case "quote_unavailable":
      return c("전환 정책을 확인할 수 없어 지금은 전환할 수 없습니다.", "Cannot read the conversion policy. Conversion is unavailable.");
    case "forbidden":
    case "not_owner":
      return c("매장 사장님만 전환할 수 있습니다.", "Only the store owner can convert.");
    case "idempotency_conflict":
      return c("요청이 겹쳤습니다. 새로고침한 뒤 다시 시도해 주세요.", "Request conflict. Refresh and try again.");
    default:
      return "";
  }
}

export function OwnerCoinConvertSection({
  storeId,
  onConverted,
}: {
  storeId: string;
  onConverted?: () => void | Promise<void>;
}) {
  const { t, safeT, language } = useI18n();
  const locale = catalogDateLocale(language);
  const [policy, setPolicy] = useState<Quote | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [points, setPoints] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useOwnerToast();
  const [convertKey, setConvertKey] = useState(() => newOwnerFormRequestKey("sp2bc"));

  const reason = useCallback(
    (code: string, extra?: { minimumCoin?: number | null; conversionUnit?: number | null; available?: number | null }) =>
      ownerCoinConvertReason(code, language, { ...extra, quote: quote ?? policy }) ||
      resolveOwnerApiErrorMessage(code, t),
    [language, quote, policy, t]
  );

  const fetchPreview = useCallback(
    async (requested: number): Promise<{ ok: true; quote: Quote } | { ok: false; error: string }> => {
      try {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "quote", requestedPoints: requested, previousRateVersion: policy?.version ?? null }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; quote?: Quote; error?: string };
        if (!res.ok || !json.ok || !json.quote) return { ok: false, error: json.error ?? "quote_unavailable" };
        return { ok: true, quote: json.quote };
      } catch {
        return { ok: false, error: "quote_unavailable" };
      }
    },
    [storeId, policy?.version]
  );

  const loadPolicy = useCallback(async () => {
    const r = await fetchPreview(0);
    if (r.ok) {
      setPolicy(r.quote);
      setPolicyError(null);
    } else {
      setPolicy(null);
      setPolicyError(r.error);
    }
  }, [fetchPreview]);

  useEffect(() => {
    void loadPolicy();
    // 매장이 바뀔 때만 정책을 다시 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  // 재감사 R1 — 전환 한도·미납 차감 미리보기도 앱 복귀·이 매장의 처리 결과 알림(Cash 충전 → 미납 자동 납부 등) 때 다시 읽는다
  useRefetchOnPageShowRestore(loadPolicy, { enableWindowFocusRefetch: true });
  // 전환 가능 Coin(출금 반려 환원)·미납 차감(Cash 충전 자동 납부) 둘 다 영향 → 매장 처리 결과 전부
  useRefetchOnNotificationArrival(loadPolicy, { storeId, kinds: STORE_MONEY_OUTCOME_KINDS });

  const requested = Math.trunc(Number(points) || 0);

  const preview = async (): Promise<Quote | null> => {
    setPreviewing(true);
    setError(null);
    try {
      const r = await fetchPreview(requested);
      if (!r.ok) {
        setQuote(null);
        setError(reason(r.error));
        return null;
      }
      setQuote(r.quote);
      setPolicy(r.quote);
      return r.quote;
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // 확인 직전에 서버 미리보기를 다시 받아 막힘 사유를 확인한다 (실행 RPC 도 다시 검사).
      const q = await fetchPreview(requested);
      if (!q.ok) {
        setError(reason(q.error));
        return;
      }
      setQuote(q.quote);
      if (!q.quote.canConvert) {
        setError(q.quote.blockers.map((b) => reason(b)).join(" "));
        return;
      }
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "convert", points: requested, expectedRateVersion: q.quote.version, idempotencyKey: convertKey }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        available?: number | null;
        minimumCoin?: number | null;
        conversionUnit?: number | null;
      };
      if (!res.ok || json.ok === false) {
        setError(
          reason(json.error ?? "convert_failed", {
            available: json.available ?? null,
            minimumCoin: json.minimumCoin ?? null,
            conversionUnit: json.conversionUnit ?? null,
          })
        );
        if (json.error === "stale_rate") await loadPolicy();
        setQuote(null);
        return;
      }
      /** OA-18 — 완료는 사장님 공통 토스트 (Cash 충전 신청과 같은 방식) */
      toast.success(
        safeT("owner_finance_cash_convert_success")
      );
      setPoints("");
      setQuote(null);
      setConvertKey(newOwnerFormRequestKey("sp2bc"));
      await loadPolicy();
      await onConverted?.();
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const p = quote ?? policy;
  const limitParts: string[] = [];
  if (p) {
    limitParts.push(ownerUiCopy(language, `최소 ${p.minimumCoin.toLocaleString(locale)} Coin`, `Min ${p.minimumCoin.toLocaleString(locale)} Coin`));
    if (p.conversionUnit > 1) limitParts.push(ownerUiCopy(language, `${p.conversionUnit} Coin 단위`, `Multiples of ${p.conversionUnit}`));
    const L = p.limits;
    if (L.maximumConversionsPerDay != null)
      limitParts.push(ownerUiCopy(language, `하루 ${L.maximumConversionsPerDay}회 (오늘 ${p.usage.dayCount}회)`, `${L.maximumConversionsPerDay}/day (today ${p.usage.dayCount})`));
    if (L.maximumConversionsPerWeek != null)
      limitParts.push(ownerUiCopy(language, `주 ${L.maximumConversionsPerWeek}회 (이번 주 ${p.usage.weekCount}회)`, `${L.maximumConversionsPerWeek}/week (this week ${p.usage.weekCount})`));
    if (L.maximumConversionsPerMonth != null)
      limitParts.push(ownerUiCopy(language, `월 ${L.maximumConversionsPerMonth}회 (이번 달 ${p.usage.monthCount}회)`, `${L.maximumConversionsPerMonth}/month (this month ${p.usage.monthCount})`));
    if (L.dailyLimitCoin != null)
      limitParts.push(ownerUiCopy(language, `하루 ${L.dailyLimitCoin.toLocaleString(locale)} Coin (오늘 ${p.usage.dayCoin.toLocaleString(locale)})`, `${L.dailyLimitCoin.toLocaleString(locale)} Coin/day (today ${p.usage.dayCoin.toLocaleString(locale)})`));
    if (L.monthlyLimitCoin != null)
      limitParts.push(ownerUiCopy(language, `월 ${L.monthlyLimitCoin.toLocaleString(locale)} Coin (이번 달 ${p.usage.monthCoin.toLocaleString(locale)})`, `${L.monthlyLimitCoin.toLocaleString(locale)} Coin/month (this month ${p.usage.monthCoin.toLocaleString(locale)})`));
    if (L.minimumIntervalHours != null && L.minimumIntervalHours > 0)
      limitParts.push(ownerUiCopy(language, `전환 간격 ${L.minimumIntervalHours}시간`, `${L.minimumIntervalHours}h between conversions`));
  }
  const convertible = policy?.conversionEnabled === true && (policy?.maxConvertible ?? 0) > 0;
  const quoteMatchesInput = quote != null && quote.requestedPoints === requested;

  return (
    <div id="convert" data-owner-bc-convert="1">
      <OwnerStoreAdminDashSection
        title={translateBy(language, "business_coin_cash")}
      >
        {policyError ? (
          <p className="text-sm text-sam-danger" role="alert" data-owner-convert-policy-unavailable="1">
            {reason(policyError)}
          </p>
        ) : !policy ? (
          <p className="text-sm text-sam-muted">{t("common_loading")}</p>
        ) : (
          <>
            <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm" data-owner-convert-policy="1">
              <dt className="text-sam-muted">{translateBy(language, "business_coin_balance")}</dt>
              <dd className="text-right tabular-nums">{policy.storePointsBalance.toLocaleString(locale)} Coin</dd>
              <dt className="text-sam-muted">{translateBy(language, "business_convertible_now")}</dt>
              <dd className="text-right tabular-nums" data-owner-convert-max="1">{policy.maxConvertible.toLocaleString(locale)} Coin</dd>
              <dt className="text-sam-muted">{translateBy(language, "business_rate")}</dt>
              <dd className="text-right tabular-nums">1 Coin = {formatCashPhp2(policy.ratePesosPerPoint)}</dd>
              {policy.outstandingFeeMinor > 0 ? (
                <>
                  <dt className="text-sam-muted">{translateBy(language, "business_unpaid_fees")}</dt>
                  <dd className="text-right tabular-nums">{formatDeliveryAdPhpMinor(policy.outstandingFeeMinor)}</dd>
                </>
              ) : null}
            </dl>
            {limitParts.length > 0 ? (
              <p className="mb-2 sam-text-helper text-sam-muted" data-owner-convert-limits="1">{limitParts.join(" · ")}</p>
            ) : null}
            {!convertible ? (
              <p className="mb-2 text-sm text-sam-danger" role="status" data-owner-convert-blocked="1">
                {policy.blockers.filter((b) => b !== "amount_required").map((b) => reason(b)).join(" ") ||
                  translateBy(language, "business_no_coin_can_be_converted_right")}
              </p>
            ) : null}
            {policy.outstandingFeeMinor > 0 ? (
              <p className="mb-2 sam-text-helper text-sam-muted">
                {translateBy(language, "business_cash_from_conversion_first_settles_unpaid")}
              </p>
            ) : null}
            <div className={OWNER_FORM_ACTION_ROW_CLASS}>
              <input
                className={`${Sam.input.base} ${OWNER_FORM_INPUT_GROW_CLASS}`}
                inputMode="numeric"
                value={points}
                disabled={!convertible || busy}
                onChange={(e) => {
                  setPoints(e.target.value.replace(/[^0-9]/g, ""));
                  setQuote(null);
                  setError(null);
                }}
                placeholder={translateBy(language, "business_coin_to_convert")}
                data-owner-convert-input="1"
              />
              <button
                type="button"
                className={OwnerCta.formSecondary}
                disabled={!convertible || busy || previewing || requested <= 0}
                onClick={() => void preview()}
                data-owner-cta="secondary"
              >
                {previewing
                  ? translateBy(language, "business_checking")
                  : safeT("owner_bc_quote")}
              </button>
            </div>
          </>
        )}
        {error ? (
          <p className="mt-2 text-sm text-sam-danger" role="alert" data-owner-convert-error="1">{error}</p>
        ) : null}
        {quote && quoteMatchesInput ? (
          <div className="mt-3 space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm" data-owner-convert-preview="1">
            {quote.canConvert ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-sam-muted">{translateBy(language, "business_coin_to_convert")}</dt>
                <dd className="text-right tabular-nums">{quote.requestedPoints.toLocaleString(locale)} Coin</dd>
                <dt className="text-sam-muted">{ownerUiCopy(language, "Coin", "Coin")}</dt>
                <dd className="text-right tabular-nums">
                  {quote.storePointsBalance.toLocaleString(locale)} → {(quote.coinAfter ?? 0).toLocaleString(locale)}
                </dd>
                <dt className="text-sam-muted">{translateBy(language, "business_cash_from_conversion")}</dt>
                <dd className="text-right tabular-nums">{formatDeliveryAdPhpMinor(quote.expectedBusinessCashMinor ?? 0)}</dd>
                <dt className="text-sam-muted">{translateBy(language, "business_unpaid_fees_settled")}</dt>
                <dd className="text-right tabular-nums">{(quote.feeSettleMinor ?? 0) > 0 ? "−" : ""}{formatDeliveryAdPhpMinor(quote.feeSettleMinor ?? 0)}</dd>
                <dt className="text-sam-muted">{translateBy(language, "business_net_cash_increase")}</dt>
                <dd className="text-right font-semibold tabular-nums">{formatDeliveryAdPhpMinor(quote.cashNetIncreaseMinor ?? 0)}</dd>
                <dt className="text-sam-muted">Cash</dt>
                <dd className="text-right tabular-nums">
                  {formatDeliveryAdPhpMinor(quote.businessCashBalanceMinor)} → {formatDeliveryAdPhpMinor(quote.cashAfterMinor ?? 0)}
                </dd>
              </dl>
            ) : (
              <p className="text-sam-danger" role="status" data-owner-convert-blockers="1">
                {quote.blockers.map((b) => reason(b)).join(" ")}
              </p>
            )}
            {quote.rateChangedNoticeRequired ? (
              <p className="font-medium text-sam-danger" role="status">{reason("stale_rate")}</p>
            ) : null}
            <button
              type="button"
              className={`${OwnerCta.formPrimary} ${OwnerCta.block}`}
              disabled={busy || !quote.canConvert}
              onClick={() => setConfirmOpen(true)}
              data-owner-cta="primary"
              data-owner-convert-open-confirm="1"
            >
              {busy ? translateBy(language, "business_converting") : ownerUiCopy(language, COIN_TO_CASH_LABEL_KO, "Convert Coin to Cash")}
            </button>
            <p className="sam-text-xxs text-sam-muted">
              {ownerUiCopy(
                language,
                `${COIN_TO_CASH_LABEL_KO}(Coin→Cash)과 ${COIN_WITHDRAWAL_LABEL_KO}(Coin 지급)은 다른 기능입니다. 미리보기는 확정이 아니며 전환 순간의 잔액·정책으로 다시 확인합니다.`,
                "Convert (Coin→Cash) is separate from withdrawal (Coin payout). The preview is not final — balance and policy are checked again at conversion."
              )}
            </p>
          </div>
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminConfirmModal
        open={confirmOpen && quote != null && quote.canConvert}
        titleId="owner-coin-cash-convert-confirm"
        title={t("popup_q_convert_coin")}
        description={
          quote && quote.canConvert
            ? t("popup_convert_coin_amounts", {
                coinFrom: quote.storePointsBalance.toLocaleString(locale),
                coinTo: (quote.coinAfter ?? 0).toLocaleString(locale),
                credit: formatDeliveryAdPhpMinor(quote.expectedBusinessCashMinor ?? 0),
                settle: formatDeliveryAdPhpMinor(quote.feeSettleMinor ?? 0),
                net: formatDeliveryAdPhpMinor(quote.cashNetIncreaseMinor ?? 0),
                cashFrom: formatDeliveryAdPhpMinor(quote.businessCashBalanceMinor),
                cashTo: formatDeliveryAdPhpMinor(quote.cashAfterMinor ?? 0),
                // 문구 틀에 ₱ 가 있어 숫자만 — CASH 표기 소수점 2자리 (계약 §3)
                rate: formatCashPhp2(quote.ratePesosPerPoint).replace("₱", ""),
              })
            : null
        }
        confirmLabel={t("popup_btn_convert")}
        confirmBusyLabel={translateBy(language, "business_converting")}
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await submit();
        }}
      />
    </div>
  );
}
