"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { Sam } from "@/lib/ui/css-vars";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";

type WithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  destination_type: string;
  created_at: string;
};

export function OwnerCoinWithdrawalPanel({
  storeId,
  onSubmitted,
}: {
  storeId: string;
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

  const submit = async () => {
    const requestedAmount = Math.trunc(Number(amount) || 0);
    if (
      requestedAmount <= 0 ||
      !accountNumber.trim() ||
      !accountName.trim() ||
      (destinationType === "bank" && !bankName.trim())
    ) {
      setError(
        safeT("owner_finance_withdraw_invalid", {
          fallbackKo: "환전 금액과 지급 계좌 정보를 확인해 주세요.",
          fallbackEn: "Check the withdrawal amount and payout account.",
        })
      );
      return;
    }

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
            idempotencyKey: `coin_withdrawal:${storeId}:${requestedAmount}:${Date.now()}`,
          }),
        }
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        setError(resolveOwnerApiErrorMessage(payload.error, t));
        return;
      }
      setAmount("");
      setBankName("");
      setAccountNumber("");
      setAccountName("");
      setNotice(
        safeT("owner_finance_withdraw_requested", {
          fallbackKo: "Coin 환전 신청이 접수되었습니다.",
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
        fallbackKo: "외부 출금 · 환전 신청",
        fallbackEn: "External payout / withdrawal",
      })}
    >
      <p className="mb-3 text-xs text-sam-muted">
        {ownerUiCopy(
          language,
          "Coin을 외부 GCash·은행으로 보내는 신청입니다. 위의 내부 Coin→Cash 전환과 다릅니다.",
          "Sends Coin to an external GCash/bank account. Separate from internal Coin→Cash conversion above."
        )}
      </p>
      <div id="coin-withdraw" className="space-y-3">
        {error ? <p className="text-sm text-sam-danger">{error}</p> : null}
        {notice ? <p className="text-sm text-sam-fg">{notice}</p> : null}
        <input
          className={Sam.input.base}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={safeT("owner_finance_withdraw_amount", {
            fallbackKo: "환전할 Coin",
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
          disabled={busy}
          onClick={() => void submit()}
          data-owner-cta="primary"
        >
          {safeT("owner_finance_withdraw_submit", {
            fallbackKo: "외부 출금 신청",
            fallbackEn: "Submit withdrawal",
          })}
        </button>
      </div>

      <div className="mt-4 border-t border-sam-border pt-3">
        <h3 className="text-sm font-semibold text-sam-fg">
          {safeT("owner_finance_withdraw_history", {
            fallbackKo: "Coin 환전 신청 내역",
            fallbackEn: "Coin withdrawal requests",
          })}
        </h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-sam-muted">
            {safeT("owner_finance_withdraw_history_empty", {
              fallbackKo: "환전 신청 내역이 없습니다.",
              fallbackEn: "No withdrawal requests yet.",
            })}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </OwnerStoreAdminDashSection>
  );
}
