"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { newOwnerFormRequestKey } from "@/lib/business/owner-form-request-key";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { Sam } from "@/lib/ui/css-vars";
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
};

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
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** IA-22 — one key per withdrawal form submission; replaced only after success. */
  const [requestKey, setRequestKey] = useState(() => newOwnerFormRequestKey("coin_withdrawal"));

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/finance/withdrawals`,
        { credentials: "include" }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        withdrawals?: WithdrawalRow[];
      };
      if (response.ok && payload.ok !== false) setRows(payload.withdrawals ?? []);
    } catch {
      // The Coin ledger remains available when request history cannot be loaded.
    }
  }, [storeId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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
    setNotice(null);
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
      setNotice(
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
        {notice ? <p className="text-sm text-sam-fg" role="status">{notice}</p> : null}
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
        <select
          className={Sam.input.base}
          value={destinationType}
          onChange={(event) => setDestinationType(event.target.value === "bank" ? "bank" : "gcash")}
        >
          <option value="gcash">GCash</option>
          <option value="bank">
            {safeT("owner_finance_withdraw_bank", {
              fallbackKo: "은행 계좌",
              fallbackEn: "Bank account",
            })}
          </option>
        </select>
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
        description={ownerUiCopy(
          language,
          `${requestedAmount.toLocaleString()} Coin → ${
            destinationType === "bank" ? `${bankName.trim()} ` : "GCash "
          }${accountNumber.trim()} (${accountName.trim()})\n신청 후 Coin이 보류되고, 지급은 관리자 확인 후 진행됩니다.`,
          `${requestedAmount.toLocaleString()} Coin → ${
            destinationType === "bank" ? `${bankName.trim()} ` : "GCash "
          }${accountNumber.trim()} (${accountName.trim()})\nThe Coin is held after the request; payout follows admin review.`
        )}
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
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-sam-muted">
            {safeT("owner_finance_withdraw_history_empty", {
              fallbackKo: "출금 신청 내역이 없습니다.",
              fallbackEn: "No withdrawal requests yet.",
            })}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              >
                <span className="font-medium text-sam-fg">
                  {Math.trunc(Number(row.amount) || 0).toLocaleString()} Coin
                </span>
                <span className="text-sam-muted">
                  {safeT(
                    row.status.toUpperCase() === "PAID"
                      ? "owner_finance_withdraw_status_paid"
                      : row.status.toUpperCase() === "REJECTED" ||
                          row.status.toUpperCase() === "CANCELLED"
                        ? "owner_finance_withdraw_status_rejected"
                        : "owner_finance_withdraw_status_requested",
                    row.status.toUpperCase() === "PAID"
                      ? { fallbackKo: "지급 완료", fallbackEn: "Paid" }
                      : row.status.toUpperCase() === "REJECTED" ||
                          row.status.toUpperCase() === "CANCELLED"
                        ? { fallbackKo: "거절", fallbackEn: "Rejected" }
                        : { fallbackKo: "처리 중", fallbackEn: "Processing" }
                  )}
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
            ))}
          </ul>
        )}
      </div>
    </OwnerStoreAdminDashSection>
  );
}
