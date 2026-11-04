"use client";

/** Canonical Owner Cash top-up and Coin → Cash conversion controls. */

import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerCoinConvertSection } from "@/components/business/owner/OwnerCoinConvertSection";
import { CurrencyBalanceCard, CurrencyHistoryRow } from "@/components/currency";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { Sam } from "@/lib/ui/css-vars";
import {
  OWNER_FORM_ACTION_ROW_CLASS,
  OWNER_FORM_INPUT_GROW_CLASS,
  OwnerCta,
} from "@/lib/business/owner-cta-classes";
import { readBalanceOrNull } from "@/lib/currency/currency-display-contract";
import { LedgerPager } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import { newOwnerFormRequestKey, ownerCashTopUpMethodLabel } from "@/lib/business/owner-form-request-key";
import { BC_CHARGE_DEFAULT_PAYMENT_METHODS } from "@/lib/stores/advertising/canonical-business-cash-contract";
import { OwnerMethodChoiceChips } from "@/components/business/owner/OwnerMethodChoiceChips";

type TopUpRow = {
  id: string;
  amountMinor: number;
  status: string;
  createdAt: string;
  decidedAt?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  rejectReason?: string | null;
};

type TopUpPolicy = {
  perRequestMaxMinor: number | null;
  monthlyMaxMinor: number | null;
  paymentMethods: string[];
  receivingAccountNote: string | null;
};

type LedgerRow = {
  id: string;
  entryKind: string;
  direction?: string;
  amountMinor?: number;
  amount?: number;
  balanceAfterMinor?: number;
  balanceAfter?: number;
  createdAt: string;
};

export function OwnerBusinessCashView({
  storeId,
  manageOnly = false,
  onChanged,
}: {
  storeId: string;
  manageOnly?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const { t, safeT, language } = useI18n();
  const toast = useOwnerToast();
  const locale = catalogDateLocale(language);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spBalance, setSpBalance] = useState<number | null>(null);
  const [bcBalanceMinor, setBcBalanceMinor] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [topUps, setTopUps] = useState<TopUpRow[]>([]);
  const [topUpOffset, setTopUpOffset] = useState(0);
  const [topUpTotal, setTopUpTotal] = useState(0);
  const [topUpPolicy, setTopUpPolicy] = useState<TopUpPolicy | null>(null);

  const [topUpAmountPhp, setTopUpAmountPhp] = useState("");
  const [topUpMethod, setTopUpMethod] = useState<string>(BC_CHARGE_DEFAULT_PAYMENT_METHODS[0]);
  const [topUpReference, setTopUpReference] = useState("");
  /** IA-22 — one key per form submission; replaced only after success (retries replay the same request). */
  const [topUpKey, setTopUpKey] = useState(() => newOwnerFormRequestKey("bc_topup"));
  const [busy, setBusy] = useState(false);
  /** 충전 신청 목록 조회 실패 — 「신청 없음」으로 숨기지 않음 (재감사 R8-d) */
  const [topUpListError, setTopUpListError] = useState(false);
  /** 내역 줄 「자세히」로 들어온 충전 신청 (`?focus=` · Coin 출금 focus 와 같은 방식 · D-6) */
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus")?.trim() || "";
  const [focusTopUp, setFocusTopUp] = useState<TopUpRow | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);

  /** 늦게 온 이전 응답이 새 쪽·새 결과를 덮지 않게 (재감사 R5-a) */
  const loadSeq = useRef(0);
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++loadSeq.current;
    // silent = 포커스·복귀 재조회 (DEF-73) — 스켈레톤 없이 잔액만 갱신.
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ topup_offset: String(topUpOffset) });
      if (focusId) qs.set("focus", focusId);
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash?${qs.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        assets?: {
          storePoints?: { balance?: number | null };
          businessCash?: { balanceMinor?: number | null };
        };
        businessCashLedger?: LedgerRow[];
        topUpRequests?: TopUpRow[];
        topUpRequestsTotal?: number;
        topUpRequestsError?: boolean;
        topUpFocus?: TopUpRow | null;
        topUpPolicy?: TopUpPolicy | null;
      };
      if (seq !== loadSeq.current) return;
      if (!res.ok || json.ok === false) {
        setError(resolveOwnerApiErrorMessage(json.error, t));
        return;
      }
      // P0-1 — 조회 실패(null)는 0 이 아니라 「—」
      setSpBalance(readBalanceOrNull(json.assets?.storePoints?.balance));
      setBcBalanceMinor(readBalanceOrNull(json.assets?.businessCash?.balanceMinor));
      setLedger(json.businessCashLedger ?? []);
      setTopUps(json.topUpRequests ?? []);
      setTopUpTotal(Math.max(0, Math.trunc(Number(json.topUpRequestsTotal) || 0)));
      setTopUpListError(Boolean(json.topUpRequestsError));
      setFocusTopUp(json.topUpFocus ?? null);
      if (json.topUpPolicy && Array.isArray(json.topUpPolicy.paymentMethods)) {
        const policy = json.topUpPolicy;
        setTopUpPolicy(policy);
        setTopUpMethod((cur) =>
          policy.paymentMethods.includes(cur) ? cur : policy.paymentMethods[0] ?? BC_CHARGE_DEFAULT_PAYMENT_METHODS[0]
        );
      }
    } catch {
      if (seq === loadSeq.current) setError(t("common_error"));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [focusId, storeId, t, topUpOffset]);

  // 첫 진입만 로딩 표시 — 충전 신청 페이지 이동은 조용히 (화면 유지)
  const firstLoadRef = useRef(true);
  useEffect(() => {
    void load(firstLoadRef.current ? undefined : { silent: true });
    firstLoadRef.current = false;
  }, [load]);

  /** DEF-73 — 관리자 충전 승인 등 외부 변경 후 화면 재진입 없이도 잔액 갱신 (탭·앱 복귀·창 포커스). */
  const refetchSilently = useCallback(() => load({ silent: true }), [load]);
  useRefetchOnPageShowRestore(refetchSilently, { enableWindowFocusRefetch: true });
  // H-12 — 관리자가 다른 기기에서 처리 → 처리 알림 도착 순간 목록·잔액 갱신 (다시 들어가지 않아도)
  // R1 — 매장 단위 알림이라 회원 종 숫자로는 못 받음(N-3 FAIL) → 이 매장의 처리 결과 신호로
  useRefetchOnNotificationArrival(refetchSilently, { storeId });

  /** FIN-04 — DB request-writer codes (owner_create_business_cash_charge_request). */
  const topUpErrorMessage = (code: string | undefined): string => {
    switch (code) {
      case "payment_reference_required":
      case "payment_reference_invalid":
        return t("owner_bc_topup_reference_required");
      case "payment_method_required":
        return t("owner_bc_topup_err_method");
      case "pending_request_exists":
        return t("owner_bc_topup_err_pending_exists");
      case "payment_reference_duplicate":
        return t("owner_bc_topup_err_reference_duplicate");
      case "amount_exceeds_request_cap":
        return t("owner_bc_topup_err_request_cap");
      case "amount_exceeds_monthly_cap":
        return t("owner_bc_topup_err_monthly_cap");
      case "invalid_amount":
        return t("owner_bc_topup_invalid_amount");
      default:
        return resolveOwnerApiErrorMessage(code, t);
    }
  };

  const submitTopUp = async () => {
    setBusy(true);
    setError(null);
    try {
      // CASH 는 센타보 단위(₱10.50) — 소수점을 버리지 않는다 (실기 2026-11-03: Math.trunc 로 ₱10.50 → ₱10 신청).
      // 소수점 3자리 이상·숫자 아님은 신청하지 않고 다시 입력받는다.
      const raw = topUpAmountPhp.trim().replace(/,/g, "");
      const amountMinor = /^\d+(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : 0;
      if (amountMinor <= 0) {
        setError(
          safeT("owner_bc_topup_invalid_amount", {
            fallbackKo: "충전 금액을 입력해 주세요 (예: 500 또는 10.50, 소수점 2자리까지)",
            fallbackEn: "Enter a top-up amount (e.g. 500 or 10.50, up to 2 decimals)",
          })
        );
        return;
      }
      const reference = topUpReference.trim();
      if (!reference) {
        setError(
          safeT("owner_bc_topup_reference_required", {
            fallbackKo: "입금 참조번호(거래번호)를 입력해 주세요. 입금 확인 후에만 충전됩니다.",
            fallbackEn: "Enter the deposit reference (transaction no.). Cash is credited only after the deposit is confirmed.",
          })
        );
        return;
      }
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "topup_request",
          amountMinor,
          paymentMethod: topUpMethod,
          paymentReference: reference,
          idempotencyKey: topUpKey,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setError(topUpErrorMessage(json.error));
        return;
      }
      /** OA-18 — 완료는 사장님 공통 토스트 (안내·경고만 화면 안 문구) */
      toast.success(
        safeT("owner_finance_cash_topup_pending", {
          fallbackKo: "캐시 충전 신청이 접수되었습니다. 관리자 승인 후 반영됩니다.",
          fallbackEn: "Cash top-up requested. It applies after admin approval.",
        })
      );
      setTopUpAmountPhp("");
      setTopUpReference("");
      setTopUpKey(newOwnerFormRequestKey("bc_topup"));
      await load({ silent: true });
      await onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (focusTopUp) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusTopUp]);

  const renderTopUpRow = (r: TopUpRow, focused: boolean) => (
    <li
      key={r.id}
      className={
        focused
          ? "flex justify-between gap-2 rounded-ui-rect border border-sam-primary bg-sam-primary-soft px-3 py-2"
          : "flex justify-between gap-2 border-b border-sam-border-soft pb-2 last:border-b-0"
      }
    >
      <span className="min-w-0">
        {formatDeliveryAdPhpMinor(r.amountMinor)}
        {/* 날짜 (PHT) — 신청·처리 (Owner 2026-11-03 「날짜 부분이 명확히」) */}
        <span className="block sam-text-xxs tabular-nums text-sam-muted">
          {language === "en" ? "Requested" : "신청"} {formatManilaDateTime(r.createdAt)}
          {r.decidedAt ? ` · ${language === "en" ? "Processed" : "처리"} ${formatManilaDateTime(r.decidedAt)}` : ""} PHT
        </span>
        {r.paymentReference ? (
          <span className="ml-2 break-all text-xs text-sam-muted">
            {r.paymentMethod ? `${ownerCashTopUpMethodLabel(r.paymentMethod, language === "ko")} · ` : ""}
            {r.paymentReference}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-sam-muted">
        {r.status.toLowerCase() === "approved"
          ? safeT("owner_finance_cash_topup_status_approved", {
              fallbackKo: "충전 완료",
              fallbackEn: "Completed",
            })
          : r.status.toLowerCase() === "rejected"
            ? safeT("owner_finance_cash_topup_status_rejected", {
                fallbackKo: "반려",
                fallbackEn: "Rejected",
              })
            : safeT("owner_finance_cash_topup_status_pending", {
                fallbackKo: "처리 중",
                fallbackEn: "Processing",
              })}
        {/* P1 — 반려 사유를 사장님에게 그대로 표시 */}
        {r.status.toLowerCase() === "rejected" && r.rejectReason ? (
          <span className="block text-xs text-sam-danger">{r.rejectReason}</span>
        ) : null}
      </span>
    </li>
  );

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="space-y-4" data-owner-business-cash="stage1">
      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

      {!manageOnly ? (
        <>
          <CurrencyBalanceCard currency="cash" amount={bcBalanceMinor} isMinor />
          <OwnerStoreAdminDashSection
            title={safeT("owner_finance_coin_balance", {
              fallbackKo: "Coin 잔액",
              fallbackEn: "Coin balance",
            })}
          >
            <p className="text-xl font-semibold text-sam-fg">
              {spBalance == null ? "—" : `${spBalance.toLocaleString(locale)} Coin`}
            </p>
          </OwnerStoreAdminDashSection>
        </>
      ) : null}

      <OwnerStoreAdminDashSection
        title={safeT("owner_finance_cash_topup_title", {
          fallbackKo: "캐시 충전",
          fallbackEn: "Top up Cash",
        })}
      >
        <p className="mb-2 text-xs text-sam-muted" data-owner-bc-topup-deposit-rule="1">
          {safeT("owner_bc_topup_deposit_rule", {
            fallbackKo: "먼저 입금한 뒤 입금 수단과 참조번호(거래번호)를 입력해 주세요. 관리자가 입금을 확인한 뒤 충전됩니다.",
            fallbackEn: "Deposit first, then enter the method and reference (transaction no.). Cash is credited after an admin confirms the deposit.",
          })}
          {topUpPolicy?.receivingAccountNote ? ` ${topUpPolicy.receivingAccountNote}` : ""}
          {topUpPolicy?.perRequestMaxMinor
            ? ` · ${safeT("owner_bc_topup_cap_note", {
                fallbackKo: "1회 최대",
                fallbackEn: "Max per request",
              })} ${formatDeliveryAdPhpMinor(topUpPolicy.perRequestMaxMinor)}`
            : ""}
        </p>
        <p className="mb-1 text-xs font-medium text-sam-muted">
          {safeT("owner_bc_topup_method", { fallbackKo: "입금 수단", fallbackEn: "Deposit method" })}
        </p>
        <div className="mb-2">
          <OwnerMethodChoiceChips
            options={(topUpPolicy?.paymentMethods ?? [...BC_CHARGE_DEFAULT_PAYMENT_METHODS]).map((m) => ({
              value: m,
              label: ownerCashTopUpMethodLabel(m, language === "ko"),
            }))}
            value={topUpMethod}
            onChange={setTopUpMethod}
            disabled={busy}
            ariaLabel={safeT("owner_bc_topup_method", { fallbackKo: "입금 수단", fallbackEn: "Deposit method" })}
            dataAttr="data-owner-bc-topup-method"
          />
        </div>
        <div className="mb-2">
          <input
            className={Sam.input.base}
            value={topUpReference}
            maxLength={100}
            onChange={(e) => setTopUpReference(e.target.value)}
            placeholder={safeT("owner_bc_topup_reference_placeholder", {
              fallbackKo: "입금 참조번호 (거래번호)",
              fallbackEn: "Deposit reference (transaction no.)",
            })}
            data-owner-bc-topup-reference="1"
          />
        </div>
        <div className={OWNER_FORM_ACTION_ROW_CLASS}>
          <input
            className={`${Sam.input.base} ${OWNER_FORM_INPUT_GROW_CLASS}`}
            inputMode="decimal"
            value={topUpAmountPhp}
            onChange={(e) => setTopUpAmountPhp(e.target.value)}
            placeholder={safeT("owner_bc_topup_placeholder", {
              fallbackKo: "금액 (₱)",
              fallbackEn: "Amount (₱)",
            })}
          />
          <button
            type="button"
            className={OwnerCta.formPrimary}
            disabled={busy}
            onClick={() => void submitTopUp()}
            data-owner-cta="primary"
          >
            {safeT("owner_bc_topup_submit", {
              fallbackKo: "충전 신청",
              fallbackEn: "Request top-up",
            })}
          </button>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerCoinConvertSection
        storeId={storeId}
        onConverted={async () => {
          // 조용한 재조회 — 섹션이 다시 마운트되지 않아 전환 완료 안내가 남는다
          await load({ silent: true });
          await onChanged?.();
        }}
      />

      {!manageOnly ? (
        <OwnerStoreAdminDashSection
          title={safeT("owner_finance_cash_history_title", {
            fallbackKo: "캐시 내역",
            fallbackEn: "Cash history",
          })}
        >
        <div id="ledger" data-owner-bc-ledger="1">
        {ledger.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("owner_bc_history_empty", {
              fallbackKo: "내역이 없습니다",
              fallbackEn: "No history yet",
            })}
          </p>
        ) : (
          <ul className="space-y-2">
            {ledger.map((row) => (
              <CurrencyHistoryRow
                key={row.id}
                currency="cash"
                title={row.entryKind}
                amount={Math.trunc(Number(row.amountMinor) || 0)}
                isMinor
                createdAt={row.createdAt}
              />
            ))}
          </ul>
        )}
        </div>
        </OwnerStoreAdminDashSection>
      ) : null}

      {topUpListError ? (
        <p className="text-sm text-sam-danger" role="alert">
          {language === "en" ? "Could not load top-up requests." : "충전 신청 목록을 불러오지 못했습니다."}
        </p>
      ) : null}
      {topUpTotal > 0 || topUps.length > 0 || focusTopUp ? (
        <OwnerStoreAdminDashSection
          title={safeT("owner_bc_topup_history_title", {
            fallbackKo: "충전 신청",
            fallbackEn: "Top-up requests",
          })}
        >
          {focusTopUp ? (
            <div ref={focusRef} className="mb-3 space-y-1" data-owner-cash-topup-focus={focusTopUp.id}>
              <p className="text-xs font-semibold text-sam-primary">
                {language === "en" ? "Selected top-up request" : "선택한 충전 신청"}
              </p>
              <ul className="text-sm">{renderTopUpRow(focusTopUp, true)}</ul>
            </div>
          ) : null}
          <ul className="space-y-2 text-sm">{topUps.map((r) => renderTopUpRow(r, false))}</ul>
          <LedgerPager
            offset={topUpOffset}
            pageSize={20}
            total={topUpTotal}
            loading={loading}
            onChange={setTopUpOffset}
            lang={language === "en" ? "en" : "ko"}
          />
        </OwnerStoreAdminDashSection>
      ) : null}
    </div>
  );
}
