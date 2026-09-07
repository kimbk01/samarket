"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { formatFinanceAmount } from "@/lib/finance/presentation";

type ConfirmState = {
  op: "credit" | "debit";
  userId: string;
  memberLabel: string;
  amount: number;
  reason: string;
  memo: string;
  balanceBefore: number;
};

/**
 * Minimal Point 지급/회수 panel — wraps existing adjustUserPoints writer.
 * Mutation only after confirmation.
 */
export function AdminPointAdjustPanel({ onChanged }: { onChanged?: () => void }) {
  const { language } = useI18n();
  const ko = language !== "en";

  const [userId, setUserId] = useState("");
  const [memberLabel, setMemberLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const openConfirm = async (op: "credit" | "debit") => {
    setError(null);
    setNotice(null);
    const uid = userId.trim();
    const amt = Math.trunc(Number(amount) || 0);
    const why = reason.trim();
    if (!uid || amt < 1 || !why) {
      setError(
        ko
          ? "회원, 금액, 사유를 입력해 주세요."
          : "Enter member, amount, and reason."
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/points/adjust?userId=${encodeURIComponent(uid)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        balance?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(ko ? "회원 Point 잔액을 확인하지 못했습니다." : "Could not load Point balance.");
        return;
      }
      const balanceBefore = Math.trunc(Number(json.balance) || 0);
      if (op === "debit" && balanceBefore < amt) {
        setError(
          ko
            ? "보유 Point보다 많은 금액은 회수할 수 없습니다."
            : "Cannot reclaim more Point than the member holds."
        );
        return;
      }
      setConfirm({
        op,
        userId: uid,
        memberLabel: memberLabel.trim() || uid.slice(0, 8),
        amount: amt,
        reason: why,
        memo: memo.trim(),
        balanceBefore,
      });
    } finally {
      setBusy(false);
    }
  };

  const mutate = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/points/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: confirm.op,
          userId: confirm.userId,
          amount: confirm.amount,
          reason: confirm.reason,
          memo: confirm.memo,
          idempotencyKey: `admin_point_${confirm.op}:${confirm.userId}:${confirm.amount}:${Date.now()}`,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        messageKo?: string;
        amount?: number;
      };
      if (!res.ok || !json.ok) {
        setError(
          json.messageKo ||
            (json.error === "insufficient_balance"
              ? ko
                ? "보유 Point보다 많은 금액은 회수할 수 없습니다."
                : "Cannot reclaim more Point than the member holds."
              : ko
                ? "Point 처리를 완료하지 못했습니다."
                : "Point adjustment failed.")
        );
        return;
      }
      const amt = confirm.amount.toLocaleString();
      setNotice(
        confirm.op === "credit"
          ? ko
            ? `${amt} Point가 지급되었습니다.`
            : `${amt} Point credited.`
          : ko
            ? `${amt} Point가 회수되었습니다.`
            : `${amt} Point reclaimed.`
      );
      setConfirm(null);
      setAmount("");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const after =
    confirm == null
      ? 0
      : confirm.op === "credit"
        ? confirm.balanceBefore + confirm.amount
        : confirm.balanceBefore - confirm.amount;

  return (
    <div
      className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-point-adjust="1"
    >
      <h2 className="text-base font-semibold text-sam-fg">
        {ko ? "Point 지급 / 회수" : "Point credit / reclaim"}
      </h2>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-sam-muted">{ko ? "회원 ID" : "Member ID"}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            data-point-adjust-user-id="1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">{ko ? "회원명 (표시)" : "Member name (display)"}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={memberLabel}
            onChange={(e) => setMemberLabel(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">{ko ? "금액 (Point)" : "Amount (Point)"}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-point-adjust-amount="1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">{ko ? "사유" : "Reason"}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-point-adjust-reason="1"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-sam-muted">{ko ? "메모" : "Memo"}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          onClick={() => void openConfirm("credit")}
          data-finance-cta="point-credit"
        >
          {ko ? "Point 지급" : "Credit Point"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          onClick={() => void openConfirm("debit")}
          data-finance-cta="point-reclaim"
        >
          {ko ? "Point 회수" : "Reclaim Point"}
        </button>
      </div>

      <AdminActionConfirmDialog
        open={!!confirm}
        title={
          confirm?.op === "credit"
            ? ko
              ? `${confirm.memberLabel} 회원에게 ${confirm.amount.toLocaleString()} Point를 지급하시겠습니까?`
              : `Credit ${confirm?.amount.toLocaleString()} Point to ${confirm?.memberLabel}?`
            : ko
              ? `${confirm?.memberLabel} 회원의 Point ${confirm?.amount.toLocaleString()}를 회수하시겠습니까?`
              : `Reclaim ${confirm?.amount.toLocaleString()} Point from ${confirm?.memberLabel}?`
        }
        description={
          confirm
            ? [
                ko ? "현재 Point" : "Current Point",
                formatFinanceAmount({ wallet: "POINT", amount: confirm.balanceBefore }),
                confirm.op === "credit" ? (ko ? "지급" : "Credit") : ko ? "회수" : "Reclaim",
                `${confirm.op === "credit" ? "+" : "-"}${formatFinanceAmount({
                  wallet: "POINT",
                  amount: confirm.amount,
                })}`,
                ko ? (confirm.op === "credit" ? "지급 후" : "회수 후") : "After",
                formatFinanceAmount({ wallet: "POINT", amount: after }),
                ko ? "사유" : "Reason",
                confirm.reason,
              ].join("\n")
            : ""
        }
        confirmLabel={
          confirm?.op === "credit"
            ? ko
              ? "Point 지급"
              : "Credit Point"
            : ko
              ? "Point 회수"
              : "Reclaim Point"
        }
        cancelLabel={ko ? "취소" : "Cancel"}
        pending={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void mutate()}
      />
    </div>
  );
}
