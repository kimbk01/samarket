"use client";

import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import { LedgerPager } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { newOwnerFormRequestKey } from "@/lib/business/owner-form-request-key";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { Sam } from "@/lib/ui/css-vars";
import { OwnerMethodChoiceChips } from "@/components/business/owner/OwnerMethodChoiceChips";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { COIN_WITHDRAWAL_LABEL_KO } from "@/lib/finance/product-decision-lock";
import { buildOwnerSupportContext } from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";

type WithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  destination_type: string;
  created_at: string;
  /** 승인 시각 — 「승인됨 (지급 대기)」 뒤에 표시 (D-9). 취소 시각은 DB 열이 없어 표시하지 않는다. */
  approved_at?: string | null;
  paid_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
};

/** P1 — 출금 신청 시각 표시 `YYYY-MM-DD HH:mm` PHT (정본 표시 함수 · 이전: 연도 없음, Owner 2026-11-03 §6-3) */
function phtShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const v = formatManilaDateTime(iso);
  return v === "—" ? "" : v;
}

/** P0-5 — 출금 신청 오류 코드 → 사장님 문구 (「처리 실패」 한 줄로 뭉개지 않음). */
function withdrawalErrorMessage(code: string | undefined, language: string, available: number | null): string {
  const c = (ko: string, en: string) => ownerUiCopy(language, ko, en);
  switch (code) {
    case "invalid_amount":
      return c("출금할 Coin을 1 이상으로 입력해 주세요.", "Enter at least 1 Coin.");
    case "exceeds_available":
    case "insufficient_coin":
      return c(
        `출금 가능한 Coin보다 많습니다${available == null ? "" : ` (출금 가능 ${available.toLocaleString()} Coin)`}.`,
        `More than available Coin${available == null ? "" : ` (available ${available.toLocaleString()} Coin)`}.`
      );
    case "balance_unavailable":
      return c("Coin 잔액을 확인할 수 없어 지금은 신청할 수 없습니다.", "Cannot read the Coin balance. Try again later.");
    case "gcash_fields_required":
      return c("GCash 번호와 예금주 이름을 입력해 주세요.", "Enter the GCash number and account name.");
    case "bank_fields_required":
      return c("은행명·계좌번호·예금주 이름을 입력해 주세요.", "Enter bank name, account number and account name.");
    case "invalid_destination_type":
      return c("지급 방법을 선택해 주세요.", "Choose a payout method.");
    case "not_owner":
    case "forbidden":
      return c("매장 사장님만 출금을 신청할 수 있습니다.", "Only the store owner can request a withdrawal.");
    default:
      return "";
  }
}

export function OwnerCoinWithdrawalPanel({
  storeId,
  availableCoin,
  onSubmitted,
}: {
  storeId: string;
  /** P0-1/P0-5 — 재무 API 의 Coin 잔액 (null = 조회 실패 → 신청 차단, 0 으로 가정 금지). */
  availableCoin: number | null;
  onSubmitted?: () => void | Promise<void>;
}) {
  const { t, safeT, language } = useI18n();
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [amount, setAmount] = useState("");
  const [destinationType, setDestinationType] = useState<"gcash" | "bank">("gcash");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useOwnerToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** IA-22 — one key per withdrawal form submission; replaced only after success. */
  const [requestKey, setRequestKey] = useState(() => newOwnerFormRequestKey("coin_withdrawal"));

  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  /** 내역 줄 「자세히」로 들어온 출금 신청 (`?focus=` · 재감사 R6-i) */
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus")?.trim() || "";
  const [focusRow, setFocusRow] = useState<WithdrawalRow | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  /** 늦게 온 이전 응답이 새 쪽을 덮지 않게 (재감사 R5-a) */
  const historySeq = useRef(0);
  const loadHistory = useCallback(async () => {
    const seq = ++historySeq.current;
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams({ offset: String(historyOffset) });
      if (focusId) qs.set("focus", focusId);
      const response = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/finance/withdrawals?${qs.toString()}`,
        { credentials: "include" }
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        withdrawals?: WithdrawalRow[];
        total?: number;
        focus?: WithdrawalRow | null;
      } | null;
      if (seq !== historySeq.current) return;
      if (response.ok && payload && payload.ok !== false) {
        setRows(payload.withdrawals ?? []);
        setHistoryTotal(Math.max(0, Math.trunc(Number(payload.total) || 0)));
        setFocusRow(payload.focus ?? null);
        setHistoryError(false);
      } else {
        // 조회 실패를 「내역 없음」으로 보이지 않게 (재감사 R8-d)
        setHistoryError(true);
      }
    } catch {
      if (seq === historySeq.current) setHistoryError(true);
    } finally {
      if (seq === historySeq.current) setHistoryLoading(false);
    }
  }, [storeId, historyOffset, focusId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  useEffect(() => {
    if (focusRow) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusRow]);
  // H-12·R1 — 이 매장의 출금 반려·지급 완료 알림이 오면 열린 화면도 갱신
  useRefetchOnNotificationArrival(loadHistory, { storeId });
  // 앱 복귀 시 관리자 처리(반려·지급) 결과 반영 — 상위 잔액 재조회와 같은 시점
  useRefetchOnPageShowRestore(loadHistory, { enableWindowFocusRefetch: true });

  const renderWithdrawalRow = (row: WithdrawalRow, focused: boolean) => (
    <li
      key={row.id}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-ui-rect border px-3 py-2 text-sm ${
        focused ? "border-sam-primary bg-sam-primary-soft" : "border-sam-border"
      }`}
    >
      <span className="font-medium text-sam-fg">
        {Math.trunc(Number(row.amount) || 0).toLocaleString()} Coin
        <span className="ml-2 text-xs font-normal text-sam-muted">
          {ownerUiCopy(language, "신청", "Requested")} {phtShort(row.created_at)}
        </span>
      </span>
      <span className="text-sam-muted">
        {(() => {
          // 상태 = DB 값 그대로 (취소를 「반려」로 묶지 않는다 — 고객이 보는 문구가 실제 처리와 같아야 함)
          const st = row.status.toUpperCase();
          if (st === "PAID")
            return safeT("owner_finance_withdraw_status_paid", { fallbackKo: "지급 완료", fallbackEn: "Paid" });
          if (st === "REJECTED")
            return safeT("owner_finance_withdraw_status_rejected", { fallbackKo: "반려", fallbackEn: "Rejected" });
          if (st === "CANCELLED")
            return safeT("owner_finance_withdraw_status_cancelled", { fallbackKo: "취소", fallbackEn: "Cancelled" });
          // DB 허용 상태 — 승인 후 지급 전 (재감사 R6-h · 이전: 「처리 중」으로 뭉뚱그림)
          if (st === "APPROVED")
            return ownerUiCopy(language, "승인됨 (지급 대기)", "Approved (awaiting payout)");
          return safeT("owner_finance_withdraw_status_requested", { fallbackKo: "처리 중", fallbackEn: "Processing" });
        })()}
        {row.status.toUpperCase() === "APPROVED" && phtShort(row.approved_at) ? ` · ${phtShort(row.approved_at)}` : ""}
        {row.status.toUpperCase() === "PAID" && row.paid_at ? ` · ${phtShort(row.paid_at)}` : ""}
        {row.status.toUpperCase() === "PAID" && row.payout_reference
          ? ` · ${ownerUiCopy(language, "지급 참조", "Payout ref")} ${row.payout_reference}`
          : ""}
        {row.status.toUpperCase() === "REJECTED" && row.rejected_at ? ` · ${phtShort(row.rejected_at)}` : ""}
        {row.status.toUpperCase() === "REJECTED" && row.rejection_reason
          ? ` · ${ownerUiCopy(language, "사유", "Reason")}: ${row.rejection_reason}`
          : ""}
        {row.status.toUpperCase() === "REJECTED"
          ? ` · ${ownerUiCopy(language, "Coin 환원됨", "Coin returned")}`
          : ""}
      </span>
      <button
        type="button"
        className={`${OwnerCta.formSecondary} text-xs`}
        data-owner-coin-withdrawal-support="1"
        data-coin-withdrawal-request-id={row.id}
        onClick={() => openWithdrawalSupport(row.id)}
      >
        {safeT("owner_finance_withdraw_support", {
          fallbackKo: "문의하기",
          fallbackEn: "Contact support",
        })}
      </button>
    </li>
  );

  const openWithdrawalSupport = (withdrawalRequestId: string) => {
    navigateToSupportCenter(
      buildOwnerSupportContext({
        enabled: true,
        category: "CASH_COIN",
        sourceSurface: "owner_coin_withdrawal",
        storeId,
        referenceType: "COIN_WITHDRAWAL_REQUEST",
        referenceId: withdrawalRequestId,
      })
    );
  };

  const requestedAmount = Math.trunc(Number(amount) || 0);
  const canWithdraw = availableCoin != null && availableCoin > 0;

  /** Validate first, then ask for confirmation (amount + payout account summary) before any money request. */
  const openConfirm = () => {
    if (!canWithdraw) return;
    if (requestedAmount > (availableCoin ?? 0)) {
      setError(withdrawalErrorMessage("exceeds_available", language, availableCoin));
      return;
    }
    if (
      requestedAmount <= 0 ||
      !accountNumber.trim() ||
      !accountName.trim() ||
      (destinationType === "bank" && !bankName.trim())
    ) {
      setError(
        safeT("owner_finance_withdraw_invalid", {
          fallbackKo: "출금 금액과 지급 계좌 정보를 확인해 주세요.",
          fallbackEn: "Check the withdrawal amount and payout account.",
        })
      );
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/finance/withdrawals`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: requestedAmount,
            destinationType,
            bankName: destinationType === "bank" ? bankName.trim() : undefined,
            accountNumber: accountNumber.trim(),
            accountName: accountName.trim(),
            idempotencyKey: requestKey,
          }),
        }
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        setError(
          withdrawalErrorMessage(payload.error, language, availableCoin) ||
            resolveOwnerApiErrorMessage(payload.error, t)
        );
        return;
      }
      setRequestKey(newOwnerFormRequestKey("coin_withdrawal"));
      setAmount("");
      setBankName("");
      setAccountNumber("");
      setAccountName("");
      /** OA-18 — 완료는 사장님 공통 토스트 (Cash 충전 신청과 같은 방식) */
      toast.success(
        safeT("owner_finance_withdraw_requested", {
          fallbackKo: "Coin 출금 신청이 접수되었습니다.",
          fallbackEn: "Coin withdrawal requested.",
        })
      );
      await Promise.all([loadHistory(), onSubmitted?.()]);
    } catch {
      setError(t("common_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OwnerStoreAdminDashSection
      title={safeT("owner_finance_withdraw_title", {
        fallbackKo: "Coin 출금 신청",
        fallbackEn: "Coin withdrawal",
      })}
    >
      <div id="coin-withdraw" className="space-y-3">
        <p className="text-sm" data-owner-withdraw-available="1">
          <span className="text-sam-muted">{ownerUiCopy(language, "출금 가능 Coin", "Available Coin")}: </span>
          <span className="font-semibold tabular-nums">
            {availableCoin == null ? "—" : `${availableCoin < 0 ? "−" : ""}${Math.abs(availableCoin).toLocaleString()} Coin`}
          </span>
        </p>
        {!canWithdraw ? (
          <p className="text-sm text-sam-danger" role="status" data-owner-withdraw-blocked="1">
            {availableCoin == null
              ? withdrawalErrorMessage("balance_unavailable", language, null)
              : availableCoin < 0
                ? ownerUiCopy(
                    language,
                    "환불로 차감된 Coin(마이너스 잔액)이 있어 출금할 수 없습니다. 새 적립으로 먼저 상계됩니다.",
                    "Coin is negative after refunds, so it cannot be withdrawn. New earnings offset it first."
                  )
                : ownerUiCopy(language, "출금할 수 있는 Coin이 없습니다.", "No Coin available to withdraw.")}
          </p>
        ) : null}
        {error ? <p className="text-sm text-sam-danger" role="alert">{error}</p> : null}
        <input
          className={Sam.input.base}
          inputMode="numeric"
          value={amount}
          disabled={!canWithdraw || busy}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
          placeholder={safeT("owner_finance_withdraw_amount", {
            fallbackKo: "출금할 Coin",
            fallbackEn: "Coin to withdraw",
          })}
        />
        <OwnerMethodChoiceChips
          options={[
            { value: "gcash", label: "GCash" },
            {
              value: "bank",
              label: safeT("owner_finance_withdraw_bank", {
                fallbackKo: "은행 계좌",
                fallbackEn: "Bank account",
              }),
            },
          ]}
          value={destinationType}
          onChange={setDestinationType}
          disabled={!canWithdraw || busy}
          ariaLabel={safeT("owner_finance_withdraw_destination", {
            fallbackKo: "출금 수단",
            fallbackEn: "Payout method",
          })}
          dataAttr="data-owner-coin-withdraw-method"
        />
        {destinationType === "bank" ? (
          <input
            className={Sam.input.base}
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            placeholder={safeT("owner_finance_withdraw_bank_name", {
              fallbackKo: "은행명",
              fallbackEn: "Bank name",
            })}
          />
        ) : null}
        <input
          className={Sam.input.base}
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value)}
          placeholder={safeT("owner_finance_withdraw_account_number", {
            fallbackKo: "계좌번호 또는 GCash 번호",
            fallbackEn: "Account or GCash number",
          })}
        />
        <input
          className={Sam.input.base}
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder={safeT("owner_finance_withdraw_account_name", {
            fallbackKo: "예금주명",
            fallbackEn: "Account name",
          })}
        />
        <button
          type="button"
          className={`${OwnerCta.formPrimary} ${OwnerCta.block}`}
          disabled={busy || !canWithdraw}
          onClick={openConfirm}
          data-owner-cta="primary"
          data-owner-coin-withdraw-open-confirm="1"
        >
          {safeT("owner_finance_withdraw_submit", {
            fallbackKo: COIN_WITHDRAWAL_LABEL_KO,
            fallbackEn: "Request Coin withdrawal",
          })}
        </button>
      </div>

      <OwnerStoreAdminConfirmModal
        open={confirmOpen}
        titleId="owner-coin-withdrawal-confirm"
        title={t("popup_q_withdraw_coin_amount", { amount: requestedAmount.toLocaleString() })}
        description={`${requestedAmount.toLocaleString()} Coin → ${
          destinationType === "bank" ? `${bankName.trim()} ` : "GCash "
        }${accountNumber.trim()} (${accountName.trim()})\n${t("owner_copy_coin_withdrawal_confirm_note")}`}
        confirmLabel={t("popup_btn_withdraw_request")}
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await submit();
          setConfirmOpen(false);
        }}
      />

      <div className="mt-4 border-t border-sam-border pt-3">
        <h3 className="text-sm font-semibold text-sam-fg">
          {safeT("owner_finance_withdraw_history", {
            fallbackKo: "Coin 출금 신청 내역",
            fallbackEn: "Coin withdrawal requests",
          })}
        </h3>
        {focusRow ? (
          <div ref={focusRef} className="mt-2 space-y-1" data-owner-coin-withdrawal-focus={focusRow.id}>
            <p className="text-xs font-semibold text-sam-primary">
              {ownerUiCopy(language, "선택한 출금 신청", "Selected withdrawal")}
            </p>
            <ul>{renderWithdrawalRow(focusRow, true)}</ul>
          </div>
        ) : null}
        {historyError ? (
          <p className="mt-2 text-sm text-sam-danger" role="alert">
            {ownerUiCopy(language, "출금 신청 내역을 불러오지 못했습니다.", "Could not load withdrawal requests.")}
          </p>
        ) : historyLoading && rows.length === 0 ? (
          <p className="mt-2 text-sm text-sam-muted">{ownerUiCopy(language, "불러오는 중…", "Loading…")}</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-sam-muted">
            {safeT("owner_finance_withdraw_history_empty", {
              fallbackKo: "출금 신청 내역이 없습니다.",
              fallbackEn: "No withdrawal requests yet.",
            })}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">{rows.map((row) => renderWithdrawalRow(row, false))}</ul>
        )}
        <LedgerPager
          offset={historyOffset}
          pageSize={20}
          total={historyTotal}
          loading={historyLoading}
          onChange={setHistoryOffset}
          lang={language === "en" ? "en" : "ko"}
        />
      </div>
    </OwnerStoreAdminDashSection>
  );
}
