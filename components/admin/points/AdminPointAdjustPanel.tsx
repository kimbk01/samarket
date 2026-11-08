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
  const { t, language } = useI18n();
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
      setError(t("admin_points_enter_member_amount"));
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
        setError(t("admin_points_could_not_load_point_balance"));
        return;
      }
      const balanceBefore = Math.trunc(Number(json.balance) || 0);
      if (op === "debit" && balanceBefore < amt) {
        setError(
          t("admin_points_cannot_reclaim_more_point_than_member")
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
          ? t("admin_points_credit_point", { memberLabel: target.memberLabel, amount: formatAdminNumber(target.amount) })
          : t("admin_points_reclaim_point_from", { memberLabel: target.memberLabel, amount: formatAdminNumber(target.amount) }),
      description: [
        t("admin_points_current_point"),
        formatFinanceAmount({ wallet: "POINT", amount: target.balanceBefore }),
        target.op === "credit" ? t("admin_points_credit") : t("admin_points_reward_log_reclaim"),
        `${target.op === "credit" ? "+" : "-"}${formatFinanceAmount({
          wallet: "POINT",
          amount: target.amount,
        })}`,
        target.op === "credit" ? t("admin_points_after_credit") : t("admin_points_after_reclaim"),
        formatFinanceAmount({ wallet: "POINT", amount: after }),
        "",
        t("admin_points_reason_shown_member_in_their_point"),
      ].join("\n"),
      reasonPlaceholder: t("admin_points_reason_shown_member"),
      confirmLabel:
        target.op === "credit" ? t("admin_points_credit_point_2") : t("admin_points_reclaim_point"),
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
        balanceBefore?: number;
        balanceAfter?: number | null;
        ledgerId?: string | null;
        duplicate?: boolean;
      };
      if (!res.ok || !json.ok) {
        setError(
          json.messageKo ||
            (json.error === "insufficient_balance"
              ? t("admin_points_cannot_reclaim_more_point_than_member")
              : t("admin_points_point_adjustment_failed"))
        );
        return;
      }
      // P1 — 「완료」는 서버가 원장 행·처리 후 잔액을 돌려준 경우만. 같은 요청 재전송은 추가 반영 없음으로 표시.
      if (json.duplicate === true) {
        setNotice(
          t("admin_points_already_processed_nothing_applied", { ledgerId: formatAdminShortId(String(json.ledgerId ?? "")) })
        );
        onChanged?.();
        return;
      }
      if (!json.ledgerId || json.balanceAfter == null) {
        setError(
          t("admin_points_could_not_confirm_ledger_record_check")
        );
        onChanged?.();
        return;
      }
      const amt = formatAdminNumber(confirm.amount);
      const before = formatFinanceAmount({ wallet: "POINT", amount: Math.trunc(Number(json.balanceBefore) || 0) });
      const after = formatFinanceAmount({ wallet: "POINT", amount: Math.trunc(Number(json.balanceAfter)) });
      setNotice(
        confirm.op === "credit"
          ? t("admin_points_point_credited_ledger", { amt, ledgerId: formatAdminShortId(json.ledgerId), before, after })
          : t("admin_points_point_reclaimed_ledger", { amt, ledgerId: formatAdminShortId(json.ledgerId), before, after })
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
        {t("admin_points_point_credit_reclaim")}
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
          <span className="text-sam-muted">{t("admin_points_member_id")}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            data-point-adjust-user-id="1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_points_member_name_display")}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={memberLabel}
            onChange={(e) => setMemberLabel(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_points_amount_point")}</span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-point-adjust-amount="1"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-sam-muted">{t("admin_points_internal_memo_admins_only_hidden_from")}</span>
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
          {t("admin_points_credit_point_2")}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={busy || !actionAllowed}
          onClick={() => void openConfirm("debit")}
          data-finance-cta="point-reclaim"
        >
          {t("admin_points_reclaim_point")}
        </AdminActionButton>
      </div>
    </div>
  );
}
