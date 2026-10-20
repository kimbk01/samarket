"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

type ConfirmState = {
  op: "credit" | "debit";
  userId: string;
  memberLabel: string;
  amount: number;
  memo: string;
  balanceBefore: number;
  idempotencyKey: string;
};

/**
 * Minimal Point 지급/회수 panel — wraps existing adjustUserPoints writer.
 * Mutation only after confirmation.
 */
export function AdminPointAdjustPanel({
  onChanged,
  actionAllowed = true,
}: {
  onChanged?: () => void;
  /** 접근표 쓰기 권한 — false 면 지급·회수 비활성 (서버 가드는 그대로). */
  actionAllowed?: boolean;
}) {
  const { language } = useI18n();
  const ko = language !== "en";

  const [userId, setUserId] = useState("");
  const [memberLabel, setMemberLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openConfirm = async (op: "credit" | "debit") => {
    if (!actionAllowed) return;
    setError(null);
    setNotice(null);
    const uid = userId.trim();
    const amt = Math.trunc(Number(amount) || 0);
    if (!uid || amt < 1) {
      setError(ko ? "회원과 금액을 입력해 주세요." : "Enter member and amount.");
      return;
    }

    let target: ConfirmState | null = null;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/points/adjust?userId=${encodeURIComponent(uid)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
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
      target = {
        op,
        userId: uid,
        memberLabel: memberLabel.trim() || formatAdminShortId(uid),
        amount: amt,
        memo: memo.trim(),
        balanceBefore,
        // 확인 1회당 1개 생성 — 같은 확인에서 여러 번 눌러도 1건만 반영된다.
        idempotencyKey: `admin_point:${crypto.randomUUID()}`,
      };
    } finally {
      setBusy(false);
    }
    if (!target) return;

    // R2 — Point 지급·회수 = payout(L2): 확인 + 사유. 사유는 API(`reason`)로 보내 원장 설명·감사 기록에 남긴다.
    const after = target.op === "credit" ? target.balanceBefore + target.amount : target.balanceBefore - target.amount;
    const c = await confirmAdminAction({
      level: adminActionLevel("payout"),
      ko,
      title:
        target.op === "credit"
          ? ko
            ? `${target.memberLabel} 회원에게 ${formatAdminNumber(target.amount)} Point를 지급하시겠습니까?`
            : `Credit ${formatAdminNumber(target.amount)} Point to ${target.memberLabel}?`
          : ko
            ? `${target.memberLabel} 회원의 Point ${formatAdminNumber(target.amount)}를 회수하시겠습니까?`
            : `Reclaim ${formatAdminNumber(target.amount)} Point from ${target.memberLabel}?`,
      description: [
        ko ? "현재 Point" : "Current Point",
        formatFinanceAmount({ wallet: "POINT", amount: target.balanceBefore }),
        target.op === "credit" ? (ko ? "지급" : "Credit") : ko ? "회수" : "Reclaim",
        `${target.op === "credit" ? "+" : "-"}${formatFinanceAmount({
          wallet: "POINT",
          amount: target.amount,
        })}`,
        ko ? (target.op === "credit" ? "지급 후" : "회수 후") : "After",
        formatFinanceAmount({ wallet: "POINT", amount: after }),
      ].join("\n"),
      confirmLabel:
        target.op === "credit" ? (ko ? "Point 지급" : "Credit Point") : ko ? "Point 회수" : "Reclaim Point",
      destructive: target.op === "debit",
    });
    if (!c.ok || !c.reason) return;
    await mutate(target, c.reason);
  };

  const mutate = async (confirm: ConfirmState, reason: string) => {
    if (busy || !actionAllowed) return;
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
          reason,
          memo: confirm.memo,
          idempotencyKey: confirm.idempotencyKey,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
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
      const amt = formatAdminNumber(confirm.amount);
      setNotice(
        confirm.op === "credit"
          ? ko
            ? `${amt} Point가 지급되었습니다.`
            : `${amt} Point credited.`
          : ko
            ? `${amt} Point가 회수되었습니다.`
            : `${amt} Point reclaimed.`
      );
      setAmount("");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-point-adjust="1"
    >
      <h2 className="text-[16px] font-semibold text-sam-fg">
        {ko ? "Point 지급 / 회수" : "Point credit / reclaim"}
      </h2>
      {error ? (
        <p role="alert" className="text-[14px] text-sam-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-[14px] text-sam-success">
          {notice}
        </p>
      ) : null}
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
        <AdminActionButton
          variant="primary"
          disabled={busy || !actionAllowed}
          onClick={() => void openConfirm("credit")}
          data-finance-cta="point-credit"
        >
          {ko ? "Point 지급" : "Credit Point"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={busy || !actionAllowed}
          onClick={() => void openConfirm("debit")}
          data-finance-cta="point-reclaim"
        >
          {ko ? "Point 회수" : "Reclaim Point"}
        </AdminActionButton>
      </div>
    </div>
  );
}
