"use client";

/**
 * FIN-08 — super_admin Cash / Coin correction form (new incidents only).
 * D-5: past data (existing integrity violations) is never corrected from here.
 * Double confirmation: this form → L3 confirm (reason + retype store name). The DB RPC re-checks super_admin,
 * writes the ADMIN_ADJUST ledger row + audit_logs, and refuses a negative balance.
 */

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { newOwnerFormRequestKey } from "@/lib/business/owner-form-request-key";

type Asset = "cash" | "coin";
type Direction = "credit" | "debit";

export function AdminStoreBalanceCorrectionForm({
  storeId,
  storeName,
  ko,
  onDone,
}: {
  storeId: string;
  storeName: string;
  ko: boolean;
  onDone?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [asset, setAsset] = useState<Asset>("cash");
  const [direction, setDirection] = useState<Direction>("credit");
  const [amountText, setAmountText] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [ledgerOnly, setLedgerOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** One key per correction; replaced only after success (a retry replays, never double-applies). */
  const [requestKey, setRequestKey] = useState(() => newOwnerFormRequestKey("admin_adjust"));

  const parsedAmount = (): number => {
    const n = Number(amountText);
    if (!Number.isFinite(n) || n <= 0) return 0;
    // Cash is entered in PHP (2 decimals) and sent in minor units; Coin is whole units.
    return asset === "cash" ? Math.round(n * 100) : Math.trunc(n);
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    const amount = parsedAmount();
    if (amount <= 0) {
      setError(t("admin_finance_enter_an_amount"));
      return;
    }
    if (evidenceRef.trim().length < 3) {
      setError(adminOperatorErrorMessage("evidence_required", ko));
      return;
    }
    const amountLabel =
      asset === "cash" ? formatFinanceAmount({ wallet: "CASH", amount, isMinor: true }) : formatFinanceAmount({ wallet: "COIN", amount });
    const dirLabel = direction === "credit" ? t("admin_finance_credit") : t("admin_finance_debit");
    const modeLabel = ledgerOnly
      ? t("admin_finance_ledger_row_only_balance_unchanged")
      : t("admin_finance_balance_and_ledger");
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("storeBalanceCorrection"),
      ko,
      title: t("admin_finance_apply_this_balance_correction"),
      description: `${storeName} · ${asset === "cash" ? "Cash" : "Coin"} ${dirLabel} ${amountLabel} · ${modeLabel}\n${
        t("admin_finance_evidence")
      }: ${evidenceRef.trim()}\n\n${
        t("admin_finance_the_reason_is_shown_to_the")
      }`,
      confirmLabel: t("admin_finance_apply_correction"),
      destructive: true,
      retypeValue: storeName,
      reasonPlaceholder: t("admin_finance_reason_shown_to_the_owner_e"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/store-finance/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          asset,
          direction,
          amount,
          reason: confirmed.reason ?? "",
          evidenceRef: evidenceRef.trim(),
          idempotencyKey: requestKey,
          ledgerOnly,
        }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        error?: string;
        idempotent?: boolean;
        balanceAfter?: number;
      };
      if (!res.ok || !json.ok) {
        setError(
          adminOperatorErrorMessage(res.status === 403 && !json.error ? "forbidden" : String(json.error ?? ""), ko)
        );
        return;
      }
      const after = Math.trunc(Number(json.balanceAfter) || 0);
      setNotice(
        `${json.idempotent ? t("admin_finance_already_applied") : t("admin_finance_correction_applied")} ${
          t("admin_finance_balance")
        }: ${asset === "cash" ? formatFinanceAmount({ wallet: "CASH", amount: after, isMinor: true }) : formatFinanceAmount({ wallet: "COIN", amount: after })}`
      );
      setRequestKey(newOwnerFormRequestKey("admin_adjust"));
      setAmountText("");
      setEvidenceRef("");
      setLedgerOnly(false);
      await onDone?.();
    } catch {
      setError(adminOperatorErrorMessage("network_error", ko));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-store-balance-correction="1"
    >
      <h2 className="text-base font-semibold text-sam-fg">
        {t("admin_finance_balance_correction_super_admin_only")}
      </h2>
      <p className="mt-1 text-[12px] text-sam-muted">
        {t("admin_finance_correct_newly_confirmed_mismatches_only_with")}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={asset}
          onChange={(e) => setAsset(e.target.value === "coin" ? "coin" : "cash")}
          aria-label={t("admin_finance_asset")}
        >
          <option value="cash">Cash (₱)</option>
          <option value="coin">Coin</option>
        </select>
        <select
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={direction}
          onChange={(e) => setDirection(e.target.value === "debit" ? "debit" : "credit")}
          aria-label={t("admin_finance_direction")}
        >
          <option value="credit">{t("admin_finance_credit_2")}</option>
          <option value="debit">{t("admin_finance_debit_2")}</option>
        </select>
        <input
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder={asset === "cash" ? t("admin_finance_amount_2") : t("admin_finance_coin_amount")}
        />
        <input
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={evidenceRef}
          maxLength={500}
          onChange={(e) => setEvidenceRef(e.target.value)}
          placeholder={t("admin_finance_evidence_admins_only_tx_no_ticket")}
        />
      </div>
      <label className="mt-2 flex items-center gap-2 text-[13px] text-sam-fg">
        <input type="checkbox" checked={ledgerOnly} onChange={(e) => setLedgerOnly(e.target.checked)} />
        {t("admin_finance_ledger_row_only_balance_is_right")}
      </label>
      {error ? (
        <p className="mt-2 text-[13px] text-sam-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-2 text-[13px] text-sam-success" role="status">
          {notice}
        </p>
      ) : null}
      <div className="mt-3">
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void submit()}>
          {busy ? t("admin_finance_working") : t("admin_finance_review_correction")}
        </AdminActionButton>
      </div>
    </section>
  );
}
