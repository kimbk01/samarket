"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { formatAdminNumber, formatAdminPhpMinor } from "@/lib/admin/ui-standard/admin-format";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";
import type { MessageKey } from "@/lib/i18n/message-key";

type Filter = "attention" | "refund" | "all";
type Decision = "recover" | "waive" | "recredit";

type ListRow = {
  id: string;
  kind: "point" | "cash";
  user_id: string;
  store_id: string | null;
  status: string;
  refund_status: string;
  point_amount: number | null;
  cash_amount_minor: number | null;
  transaction_id: string | null;
  environment: string | null;
  review_reason: string | null;
  created_at: string;
  user_nickname: string | null;
  store_name: string | null;
};

type Detail = {
  row: Record<string, unknown>;
  balance: number | null;
  notifications: Array<Record<string, unknown>>;
};

const STATUS_KEYS: Record<string, MessageKey> = {
  prepared: "apple_iap_admin_status_prepared",
  deferred: "apple_iap_admin_status_deferred",
  user_cancelled: "apple_iap_admin_status_user_cancelled",
  failed: "apple_iap_admin_status_failed",
  received: "apple_iap_admin_status_received",
  credited: "apple_iap_admin_status_credited",
  review: "apple_iap_admin_status_review",
};

const REFUND_KEYS: Record<string, MessageKey> = {
  none: "apple_iap_admin_refund_none",
  review: "apple_iap_admin_refund_review",
  recovered: "apple_iap_admin_refund_recovered",
  waived: "apple_iap_admin_refund_waived",
  reversed_review: "apple_iap_admin_refund_reversed_review",
  reversed: "apple_iap_admin_refund_reversed",
};

const DECISION_KEYS: Record<Decision, MessageKey> = {
  recover: "apple_iap_admin_action_recover",
  waive: "apple_iap_admin_action_waive",
  recredit: "apple_iap_admin_action_recredit",
};

/** 회수 = 잔액 차감(되돌릴 수 없음, 거래번호 재입력) · 회수 안 함 = 검토 종결 · 되돌림 = 지급 */
const DECISION_ACTION: Record<Decision, AdminActionKind> = {
  recover: "refund",
  waive: "reject",
  recredit: "payout",
};

function amountLabel(kind: string, point: unknown, cashMinor: unknown): string {
  return kind === "cash" ? formatAdminPhpMinor(cashMinor as number) : `${formatAdminNumber(point as number)}P`;
}

/** Apple 인앱 결제 검토 — 지급 재처리 · 환불 회수/회수 안 함/회수분 되돌림 (최고관리자) */
export function AdminAppleIapReviewPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [filter, setFilter] = useState<Filter>("attention");
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/apple-iap?filter=${filter}`, { credentials: "include", cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rows?: ListRow[] };
        if (cancelled) return;
        if (!res.ok || j.ok !== true) {
          setError({ code: String(j.error ?? "load_failed"), httpStatus: res.status });
          return;
        }
        setRows(j.rows ?? []);
      } catch {
        if (!cancelled) setError({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, reloadNonce]);

  const loadDetail = useCallback(async (id: string) => {
    setDetail(null);
    const res = await fetch(`/api/admin/apple-iap/${id}`, { credentials: "include", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean } & Partial<Detail>;
    if (res.ok && j.ok === true && j.row) {
      setDetail({ row: j.row, balance: j.balance ?? null, notifications: j.notifications ?? [] });
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const post = async (path: string, body: Record<string, unknown>) => {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/apple-iap/${selectedId}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok !== true) {
        setMessage(t("apple_iap_admin_action_failed", { error: String(j.error ?? res.status) }));
        return;
      }
      setMessage(t("apple_iap_admin_action_done"));
      await loadDetail(selectedId);
      setReloadNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const credit = async () => {
    if (busy) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("payout"),
      ko,
      title: t("apple_iap_admin_action_credit"),
      confirmLabel: adminCta("payout", ko),
      reasonPlaceholder: t("apple_iap_admin_note_ph"),
    });
    if (confirmed.ok) await post("credit", { note: confirmed.reason ?? "" });
  };

  const decide = async (decision: Decision) => {
    if (busy) return;
    const label = t(DECISION_KEYS[decision]);
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(DECISION_ACTION[decision]),
      ko,
      title: label,
      confirmLabel: label,
      destructive: decision === "recover",
      retypeValue: decision === "recover" ? String(detail?.row.transaction_id ?? "") : undefined,
      reasonPlaceholder: t("apple_iap_admin_note_ph"),
    });
    if (!confirmed.ok) return;
    await post("refund-decision", { decision, note: confirmed.reason ?? "" });
  };

  const d = detail?.row;
  const dStatus = String(d?.status ?? "");
  const dRefund = String(d?.refund_status ?? "none");
  const canCredit = dStatus === "received" || (dStatus === "review" && d?.review_reason === "attempt_reused");
  const canRecover = dStatus === "credited" && dRefund === "review";
  const canWaive = dRefund === "review";
  const canRecredit = dRefund === "reversed_review";

  return (
    <div className="space-y-4" data-admin-apple-iap="1">
      <AdminPageHeader titleKey="admin_menu_apple_iap" descriptionKey="apple_iap_admin_desc" />

      <AdminTabs
        ariaLabel={t("admin_menu_apple_iap")}
        syncUrl={false}
        value={filter}
        onChange={(id) => {
          setFilter(id as Filter);
          setSelectedId(null);
        }}
        tabs={[
          { id: "attention", label: t("apple_iap_admin_filter_attention") },
          { id: "refund", label: t("apple_iap_admin_filter_refund") },
          { id: "all", label: t("apple_iap_admin_filter_all") },
        ]}
      />

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={() => setReloadNonce((n) => n + 1)} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("apple_iap_admin_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("apple_iap_admin_col_time")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_col_member")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_col_amount")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_col_status")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_col_refund")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_col_txn")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-sam-border-soft last:border-b-0 ${selectedId === r.id ? "bg-sam-primary-soft" : ""}`}
                >
                  <td className="px-3 py-2 tabular-nums">{formatAdminManilaDateTime(r.created_at)}</td>
                  <td className="px-3 py-2">
                    {r.user_nickname ?? r.user_id.slice(0, 8)}
                    {r.store_name ? <span className="block text-sam-muted">{r.store_name}</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{amountLabel(r.kind, r.point_amount, r.cash_amount_minor)}</td>
                  <td className="px-3 py-2">
                    {STATUS_KEYS[r.status] ? t(STATUS_KEYS[r.status]) : r.status}
                    {r.review_reason ? <span className="block text-sam-muted">{r.review_reason}</span> : null}
                  </td>
                  <td className="px-3 py-2">{REFUND_KEYS[r.refund_status] ? t(REFUND_KEYS[r.refund_status]) : r.refund_status}</td>
                  <td className="px-3 py-2 font-mono">
                    {r.transaction_id ?? "—"}
                    {r.environment === "Sandbox" ? <span className="ml-1 text-sam-warning">Sandbox</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedId(r.id);
                        setMessage(null);
                      }}
                    >
                      {adminCta("detail", ko)}
                    </AdminActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          {!d ? (
            <AdminLoadingState ko={ko} />
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sam-text-body-secondary md:grid-cols-2">
                <dt className="text-sam-muted">{t("apple_iap_admin_col_txn")}</dt>
                <dd className="font-mono">{String(d.transaction_id ?? "—")}</dd>
                <dt className="text-sam-muted">{t("apple_iap_admin_col_amount")}</dt>
                <dd>{amountLabel(String(d.kind), d.point_amount, d.cash_amount_minor)}</dd>
                <dt className="text-sam-muted">{t("apple_iap_admin_col_status")}</dt>
                <dd>
                  {STATUS_KEYS[dStatus] ? t(STATUS_KEYS[dStatus]) : dStatus}
                  {d.review_reason ? ` · ${String(d.review_reason)}` : ""}
                </dd>
                <dt className="text-sam-muted">{t("apple_iap_admin_col_refund")}</dt>
                <dd>{REFUND_KEYS[dRefund] ? t(REFUND_KEYS[dRefund]) : dRefund}</dd>
                <dt className="text-sam-muted">{t("apple_iap_admin_detail_balance")}</dt>
                <dd className="tabular-nums">
                  {detail?.balance == null ? "—" : amountLabel(String(d.kind), detail.balance, detail.balance)}
                </dd>
                <dt className="text-sam-muted">{t("apple_iap_admin_detail_refund_history")}</dt>
                <dd>
                  {d.refund_decided_at
                    ? `${formatAdminManilaDateTime(String(d.refund_decided_at))} PHT · ${String(d.refund_decided_by ?? "").slice(0, 8)} · ${String(d.refund_decision_note ?? "")}`
                    : "—"}
                </dd>
              </dl>

              {detail && detail.notifications.length > 0 ? (
                <div>
                  <p className="mb-1 font-semibold sam-text-body-secondary">{t("apple_iap_admin_detail_notifications")}</p>
                  <ul className="space-y-0.5 sam-text-helper text-sam-muted">
                    {detail.notifications.map((n) => (
                      <li key={String(n.notification_uuid)}>
                        {formatAdminManilaDateTime(String(n.received_at))} PHT · {String(n.notification_type)}
                        {n.subtype ? `/${String(n.subtype)}` : ""} · {String(n.result)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {canCredit ? (
                  <AdminActionButton variant="primary" disabled={busy} onClick={() => void credit()}>
                    {t("apple_iap_admin_action_credit")}
                  </AdminActionButton>
                ) : null}
                {canRecover ? (
                  <AdminActionButton variant="danger" disabled={busy} onClick={() => void decide("recover")}>
                    {t("apple_iap_admin_action_recover")}
                  </AdminActionButton>
                ) : null}
                {canWaive ? (
                  <AdminActionButton variant="secondary" disabled={busy} onClick={() => void decide("waive")}>
                    {t("apple_iap_admin_action_waive")}
                  </AdminActionButton>
                ) : null}
                {canRecredit ? (
                  <AdminActionButton variant="primary" disabled={busy} onClick={() => void decide("recredit")}>
                    {t("apple_iap_admin_action_recredit")}
                  </AdminActionButton>
                ) : null}
                <AdminActionButton variant="quiet" onClick={() => setSelectedId(null)}>
                  {adminCta("close", ko)}
                </AdminActionButton>
              </div>
              {message ? (
                <p className="sam-text-helper text-sam-fg" role="status">
                  {message}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
