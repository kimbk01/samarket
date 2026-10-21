"use client";

/**
 * FIN-08 — super_admin Cash / Coin correction form (new incidents only).
 * D-5: past data (existing integrity violations) is never corrected from here.
 * Double confirmation: this form → L3 confirm (reason + retype store name). The DB RPC re-checks super_admin,
 * writes the ADMIN_ADJUST ledger row + audit_logs, and refuses a negative balance.
 */

import { useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
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
      setError(ko ? "금액을 입력해 주세요." : "Enter an amount.");
      return;
    }
    if (evidenceRef.trim().length < 3) {
      setError(adminOperatorErrorMessage("evidence_required", ko));
      return;
    }
    const amountLabel = asset === "cash" ? `₱${(amount / 100).toFixed(2)}` : `${amount.toLocaleString()} Coin`;
    const dirLabel = direction === "credit" ? (ko ? "증가" : "credit") : ko ? "차감" : "debit";
    const modeLabel = ledgerOnly
      ? ko
        ? "원장 기록만 (잔액 변경 없음)"
        : "Ledger row only (balance unchanged)"
      : ko
        ? "잔액과 원장 함께 정정"
        : "Balance and ledger";
    const confirmed = await confirmAdminAction({
      level: "L3",
      ko,
      title: ko ? "잔액을 정정하시겠습니까?" : "Apply this balance correction?",
      description: `${storeName} · ${asset === "cash" ? "Cash" : "Coin"} ${dirLabel} ${amountLabel} · ${modeLabel}\n${
        ko ? "근거" : "Evidence"
      }: ${evidenceRef.trim()}`,
      confirmLabel: ko ? "정정 실행" : "Apply correction",
      destructive: true,
      retypeValue: storeName,
      reasonPlaceholder: ko ? "예: 은행 입금 누락 확인 (거래번호 …)" : "e.g. Missed bank deposit confirmed (tx …)",
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
        `${json.idempotent ? (ko ? "이미 처리된 정정입니다." : "Already applied.") : ko ? "정정 완료." : "Correction applied."} ${
          ko ? "현재 잔액" : "Balance"
        }: ${asset === "cash" ? `₱${(after / 100).toFixed(2)}` : `${after.toLocaleString()} Coin`}`
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
        {ko ? "잔액 정정 (최고 관리자 전용)" : "Balance correction (super admin only)"}
      </h2>
      <p className="mt-1 text-[12px] text-sam-muted">
        {ko
          ? "새로 확인된 불일치만 근거와 함께 정정합니다. 과거 기록은 정정하지 않습니다. 원장·작업 기록에 남고 되돌릴 수 없습니다."
          : "Correct newly confirmed mismatches only, with evidence. Past records are not corrected. Recorded in the ledger and activity log; cannot be undone."}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={asset}
          onChange={(e) => setAsset(e.target.value === "coin" ? "coin" : "cash")}
          aria-label={ko ? "자산" : "Asset"}
        >
          <option value="cash">Cash (₱)</option>
          <option value="coin">Coin</option>
        </select>
        <select
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={direction}
          onChange={(e) => setDirection(e.target.value === "debit" ? "debit" : "credit")}
          aria-label={ko ? "방향" : "Direction"}
        >
          <option value="credit">{ko ? "증가 (+)" : "Credit (+)"}</option>
          <option value="debit">{ko ? "차감 (−)" : "Debit (−)"}</option>
        </select>
        <input
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder={asset === "cash" ? (ko ? "금액 (₱)" : "Amount (₱)") : ko ? "Coin 수량" : "Coin amount"}
        />
        <input
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={evidenceRef}
          maxLength={500}
          onChange={(e) => setEvidenceRef(e.target.value)}
          placeholder={ko ? "근거 (거래번호·문의 번호·문서)" : "Evidence (tx no. / ticket / document)"}
        />
      </div>
      <label className="mt-2 flex items-center gap-2 text-[13px] text-sam-fg">
        <input type="checkbox" checked={ledgerOnly} onChange={(e) => setLedgerOnly(e.target.checked)} />
        {ko ? "원장 기록만 (잔액은 맞고 원장이 빠진 경우)" : "Ledger row only (balance is right, ledger is missing a row)"}
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
          {busy ? (ko ? "처리 중…" : "Working…") : ko ? "정정 검토" : "Review correction"}
        </AdminActionButton>
      </div>
    </section>
  );
}
