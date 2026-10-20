"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { financeStoreHref } from "@/lib/finance/routes";
import { financeStatusLabel, formatFinanceAmount } from "@/lib/finance/presentation";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { AdminTechId, formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

type WithdrawalRow = {
  id: string;
  store_id: string;
  owner_user_id?: string | null;
  amount: number;
  status: string;
  destination_type: string;
  account_name: string;
  account_number?: string | null;
  bank_name?: string | null;
  source_kind?: string | null;
  created_at: string;
  paid_at?: string | null;
  paid_by?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  approved_by?: string | null;
};

type PendingAct = {
  requestId: string;
  action: "reject" | "mark_paid";
  amount: number;
  /** mark_paid: 요청 행의 지급 수단(gcash/bank) — RPC p_payout_method */
  payoutMethod?: string;
};

/**
 * Coin withdrawal ops list — reject | mark_paid only (no approve invent).
 */
export function AdminCoinWithdrawalsPanel() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const focusRequestId = (searchParams.get("coinWithdrawalRequestId") ?? "").trim();
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Support deep-link may target a decided row — load all when focusing.
      const statusQ = focusRequestId ? "all" : statusFilter;
      const qs = new URLSearchParams({ status: statusQ });
      const res = await fetch(`/api/admin/coin-withdrawals?${qs}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; requests?: WithdrawalRow[] };
      if (res.ok && json.ok) {
        let next = json.requests ?? [];
        if (focusRequestId) {
          const hit = next.find((r) => r.id === focusRequestId);
          next = hit ? [hit, ...next.filter((r) => r.id !== hit.id)] : next;
        }
        setRows(next);
      } else
        setError(
          safeT("admin_store_finance_withdrawals_load_failed", {
            fallbackKo: "Coin 출금 요청을 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load Coin withdrawal requests.",
          })
        );
    } catch {
      setError(
        safeT("common_network_error", {
          fallbackKo: "네트워크 오류가 발생했습니다.",
          fallbackEn: "A network error occurred.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [safeT, statusFilter, focusRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusRequestId || loading) return;
    const el = document.querySelector(
      `[data-finance-withdrawal-row="${CSS.escape(focusRequestId)}"]`
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusRequestId, loading, rows]);

  const act = async (
    requestId: string,
    action: "reject" | "mark_paid",
    reason: string,
    payout?: { method: string; reference: string }
  ) => {
    if (action === "mark_paid" && (!payout?.reference.trim() || !payout?.method.trim())) {
      setError(
        safeT("admin_api_err_payout_reference_required", {
          fallbackKo: "지급 참조번호를 입력해 주세요.",
          fallbackEn: "Enter a payout reference.",
        })
      );
      return;
    }
    setBusyId(requestId);
    setError("");
    try {
      const res = await fetch("/api/admin/coin-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "mark_paid" && payout
            ? {
                action,
                requestId,
                payoutMethod: payout.method.trim(),
                payoutReference: payout.reference.trim(),
                reason,
              }
            : { action, requestId, reason }
        ),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (json.error === "payout_reference_required") {
          setError(
            safeT("admin_api_err_payout_reference_required", {
              fallbackKo: "지급 참조번호를 입력해 주세요.",
              fallbackEn: "Enter a payout reference.",
            })
          );
          return;
        }
        setError(
          safeT("admin_store_finance_withdrawals_action_failed", {
            fallbackKo: "Coin 출금 요청 처리에 실패했습니다.",
            fallbackEn: "Couldn’t process the Coin withdrawal.",
          })
        );
        return;
      }
      setPending(null);
      emitAdminQueueChanged("coin_withdrawals");
      await load();
    } catch {
      setError(
        safeT("common_network_error", {
          fallbackKo: "네트워크 오류가 발생했습니다.",
          fallbackEn: "A network error occurred.",
        })
      );
    } finally {
      setBusyId(null);
    }
  };

  /** 출금 반려 = reject(L2): 확인 + 사유 → API `reason` → 감사 기록. */
  const askReject = async (requestId: string, amount: number) => {
    const c = await confirmAdminAction({
      level: adminActionLevel("reject"),
      ko,
      title: ko ? "출금을 반려하시겠습니까?" : "Reject this withdrawal?",
      description: ko
        ? `${formatAdminNumber(amount)} Coin 출금 요청을 반려합니다.`
        : `${formatAdminNumber(amount)} Coin withdrawal will be rejected.`,
      confirmLabel: ko ? "출금 반려" : "Reject withdrawal",
      destructive: true,
    });
    if (!c.ok || !c.reason) return;
    await act(requestId, "reject", c.reason);
  };

  /**
   * 출금 지급 완료 = payout(L2). 지급 참조번호는 폼 대화상자(아래)에서 받고,
   * 이어서 확인 + 사유를 받아 함께 API 로 보낸다 (감사 기록에 사유 저장).
   */
  const askMarkPaid = async (target: PendingAct, reference: string) => {
    setPending(null);
    const c = await confirmAdminAction({
      level: adminActionLevel("payout"),
      ko,
      title: ko ? "출금 지급을 완료 처리하시겠습니까?" : "Mark this withdrawal as paid?",
      description: ko
        ? `${formatAdminNumber(target.amount)} Coin 출금 요청을 지급 완료합니다. 참조번호: ${reference.trim()}`
        : `${formatAdminNumber(target.amount)} Coin withdrawal will be marked paid. Reference: ${reference.trim()}`,
      confirmLabel: ko ? "출금 지급 완료" : "Mark paid",
    });
    if (!c.ok || !c.reason) return;
    await act(target.requestId, "mark_paid", c.reason, {
      method: target.payoutMethod ?? "",
      reference,
    });
  };

  return (
    <section className="space-y-3" data-admin-coin-withdrawals-panel="1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CurrencyBadge currency="coin" />
          <h2 className="text-[16px] font-semibold text-sam-fg">
            {safeT("admin_store_finance_withdrawals", {
              fallbackKo: "Coin 출금 요청",
              fallbackEn: "Coin withdrawal requests",
            })}
          </h2>
        </div>
        <label className="sam-text-helper">
          <span className="text-sam-muted">{ko ? "상태" : "Status"}</span>
          <select
            className="ml-2 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-finance-withdrawal-status-filter="1"
          >
            <option value="REQUESTED">{ko ? "신청" : "Requested"}</option>
            <option value="PAID">{ko ? "지급 완료" : "Paid"}</option>
            <option value="REJECTED">{ko ? "반려" : "Rejected"}</option>
            <option value="all">{ko ? "전체" : "All"}</option>
          </select>
        </label>
      </div>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "CTA: 출금 반려 · 지급 완료만. 승인(approve) writer는 없습니다. Cash 출금은 없습니다."
          : "CTAs: reject · mark paid only. No approve writer. Cash withdrawal does not exist."}
      </p>
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-[14px] text-sam-fg"
        >
          <span>{error}</span>
          <AdminActionButton variant="secondary" size="sm" onClick={() => void load()}>
            {adminCta("refresh", ko)}
          </AdminActionButton>
        </div>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_store_finance_withdrawals_empty", {
            fallbackKo: "해당 상태의 출금 요청이 없습니다.",
            fallbackEn: "No withdrawal requests for this status.",
          })}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[56rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "요청일" : "Requested"}</th>
                <th className="px-3 py-2">{ko ? "매장" : "Store"}</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2 text-right">{ko ? "Requested Coin" : "Requested Coin"}</th>
                <th className="px-3 py-2">{ko ? "Payout" : "Payout"}</th>
                <th className="px-3 py-2">{ko ? "Currency" : "Currency"}</th>
                <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
                <th className="px-3 py-2">{ko ? "처리일" : "Processed"}</th>
                <th className="px-3 py-2">{ko ? "Admin Actor" : "Admin actor"}</th>
                <th className="px-3 py-2">{ko ? "Reference" : "Reference"}</th>
                <th className="px-3 py-2">{ko ? "작업" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {rows.map((r) => {
                const payoutLabel =
                  r.destination_type === "gcash"
                    ? `GCash · ${r.account_name}`
                    : `${r.bank_name || "Bank"} · ${r.account_name}`;
                const adminActor = r.paid_by || r.rejected_by || r.approved_by || null;
                return (
                  <tr
                    key={r.id}
                    data-finance-withdrawal-row={r.id}
                    data-finance-withdrawal-focus={
                      focusRequestId && r.id === focusRequestId ? "1" : undefined
                    }
                    className={
                      focusRequestId && r.id === focusRequestId
                        ? "bg-[var(--currency-coin-bg)]"
                        : undefined
                    }
                  >
                    <td className="px-3 py-2 sam-text-xxs whitespace-nowrap">
                      {r.created_at ? formatAdminManilaDateTime(r.created_at) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={financeStoreHref(r.store_id)}
                        className="font-mono text-[12px] font-semibold text-signature hover:underline"
                      >
                        {formatAdminShortIdEllipsis(r.store_id)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px]">
                      <AdminTechId id={r.owner_user_id} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatFinanceAmount({ wallet: "COIN", amount: r.amount })}
                    </td>
                    <td className="px-3 py-2 sam-text-xxs">{payoutLabel}</td>
                    <td className="px-3 py-2">Coin</td>
                    <td className="px-3 py-2">{financeStatusLabel(r.status, ko)}</td>
                    <td className="px-3 py-2 sam-text-xxs">
                      {r.paid_at
                        ? formatAdminManilaDateTime(r.paid_at)
                        : r.rejected_at
                          ? formatAdminManilaDateTime(r.rejected_at)
                          : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px]" data-finance-withdrawal-admin-actor="1">
                      <AdminTechId id={adminActor} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px]"><AdminTechId id={r.id} /></td>
                    <td className="px-3 py-2">
                      {String(r.status).toUpperCase() === "REQUESTED" ? (
                        <div className="flex flex-wrap gap-2">
                          <AdminActionButton
                            variant="ghost"
                            size="sm"
                            disabled={busyId === r.id}
                            onClick={() => void askReject(r.id, r.amount)}
                            data-finance-cta="reject-withdrawal"
                          >
                            {adminCta("reject", ko)}
                          </AdminActionButton>
                          <AdminActionButton
                            variant="ghost"
                            size="sm"
                            disabled={busyId === r.id}
                            onClick={() =>
                              setPending({
                                requestId: r.id,
                                action: "mark_paid",
                                amount: r.amount,
                                payoutMethod: r.destination_type,
                              })
                            }
                            data-finance-cta="mark-withdrawal-paid"
                          >
                            {ko ? "지급 완료" : "Mark paid"}
                          </AdminActionButton>
                        </div>
                      ) : (
                        <span className="sam-text-xxs text-sam-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="sam-text-xxs text-sam-muted" data-finance-withdrawal-admin-actor="note">
        {ko
          ? "Admin actor = paid_by / rejected_by / approved_by (canonical request columns)."
          : "Admin actor = paid_by / rejected_by / approved_by (canonical request columns)."}
      </p>

      {pending ? (
        <PayoutReferenceSheet
          ko={ko}
          amount={pending.amount}
          payoutMethod={pending.payoutMethod}
          busy={busyId === pending.requestId}
          onCancel={() => setPending(null)}
          onContinue={(reference) => void askMarkPaid(pending, reference)}
        />
      ) : null}
    </section>
  );
}

/**
 * 지급 완료 입력 폼 — 지급 참조번호(필수)만 받는다. 실행 확인 + 사유는 이어서 `confirmAdminAction`(payout L2).
 */
function PayoutReferenceSheet({
  ko,
  amount,
  payoutMethod,
  busy,
  onCancel,
  onContinue,
}: {
  ko: boolean;
  amount: number;
  payoutMethod?: string;
  busy: boolean;
  onCancel: () => void;
  onContinue: (reference: string) => void;
}) {
  const [reference, setReference] = useState("");
  const ready = reference.trim().length > 0;
  const methodLabel = payoutMethod === "gcash" ? "GCash" : "Bank";
  return (
    <AdminFormSheet
      title={ko ? "출금 지급 완료" : "Mark withdrawal paid"}
      subtitle={
        ko
          ? `${formatAdminNumber(amount)} Coin 출금 요청을 지급 완료합니다.`
          : `${formatAdminNumber(amount)} Coin withdrawal will be marked paid.`
      }
      onClose={busy ? () => undefined : onCancel}
      dismissible={!busy}
      maxWidthClass="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <AdminActionButton variant="secondary" disabled={busy} onClick={onCancel}>
            {adminCta("cancel", ko)}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            disabled={busy || !ready}
            onClick={() => onContinue(reference.trim())}
            data-finance-payout-reference-continue="1"
          >
            {ko ? "출금 지급 완료" : "Mark paid"}
          </AdminActionButton>
        </div>
      }
    >
      <label className="block space-y-1 text-[13px] text-sam-fg">
        <span className="font-medium">
          {ko
            ? `지급 참조번호 (${methodLabel} 거래번호 등)`
            : `Payout reference (${methodLabel} transaction id, etc.)`}
        </span>
        <input
          required
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={ko ? "거래번호·송금표시 등" : "Transaction id, transfer note, etc."}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
          data-finance-payout-reference-input="mark_paid"
        />
      </label>
    </AdminFormSheet>
  );
}
