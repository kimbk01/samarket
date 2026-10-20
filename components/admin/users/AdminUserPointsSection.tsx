"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { PointChargeBadge } from "@/components/points/PointChargeBadge";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { PointChargeRequest } from "@/lib/types/point";
import type {
  PointFinancialFilter,
  PointFinancialHistoryItem,
  PointFinancialSummary,
} from "@/lib/points/point-financial-history";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminStatusLabelText } from "@/lib/admin/status-labels/admin-status-label-registry";
import { POINTS_CHARGE_STATUS_NS } from "@/lib/admin/status-labels/r5-points-status-labels";

interface AdminUserPointsSectionProps {
  userId: string;
}

function formatSigned(signed: number): string {
  const abs = formatAdminNumber(Math.abs(signed));
  return signed < 0 ? `-${abs} P` : `+${abs} P`;
}

export function AdminUserPointsSection({ userId }: AdminUserPointsSectionProps) {
  const { t, language, safeT } = useI18n();
  const ko = language !== "en";
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [summary, setSummary] = useState<PointFinancialSummary | null>(null);
  const [items, setItems] = useState<PointFinancialHistoryItem[]>([]);
  const [charges, setCharges] = useState<PointChargeRequest[]>([]);
  const [filter, setFilter] = useState<PointFinancialFilter>("all");
  const [surface, setSurface] = useState<"history" | "charges">("history");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [selected, setSelected] = useState<PointFinancialHistoryItem | null>(null);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = Boolean(opts?.append);
      if (!append) setLoading(true);
      setErr("");
      try {
        const qs = new URLSearchParams({ filter, limit: "40" });
        if (opts?.cursor) qs.set("cursor", opts.cursor);
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/points?${qs}`, {
          credentials: "include",
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          balance?: number;
          summary?: PointFinancialSummary;
          history?: {
            items?: PointFinancialHistoryItem[];
            hasMore?: boolean;
            nextCursor?: string | null;
          };
          chargeRequests?: PointChargeRequest[];
        };
        if (!res.ok || j.ok === false) {
          setErr(resolveAdminApiErrorMessage(j.error, t, "admin_users_action_failed"));
          if (!append) {
            setBalance(null);
            setBalanceUnavailable(true);
            setSummary(null);
            setItems([]);
            setCharges([]);
          }
          return;
        }
        if (typeof j.balance === "number" && Number.isFinite(j.balance)) {
          setBalance(j.balance);
          setBalanceUnavailable(false);
        } else {
          setBalance(null);
          setBalanceUnavailable(true);
        }
        setSummary(j.summary ?? null);
        const page = Array.isArray(j.history?.items) ? j.history!.items! : [];
        setItems((prev) => (append ? [...prev, ...page] : page));
        setHasMore(Boolean(j.history?.hasMore));
        setNextCursor(j.history?.nextCursor ?? null);
        if (!append) setCharges(Array.isArray(j.chargeRequests) ? j.chargeRequests : []);
      } catch {
        if (!append) {
          setErr(resolveAdminApiErrorMessage("network_error", t, "admin_users_action_failed"));
          setBalance(null);
          setBalanceUnavailable(true);
          setSummary(null);
          setItems([]);
          setCharges([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [userId, filter, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 지급/차감 = payout(L2) — 확인 + 사유. 사유는 확인창에서 받아 그대로 API(`reason`)로 보낸다 (원장 설명·감사 기록).
   * 멱등 키는 확인 1회당 1개 (같은 확인에서 여러 번 눌러도 1건만 반영).
   */
  const openAdjustConfirm = async (sign: 1 | -1) => {
    if (busy) return;
    const amount = Math.trunc(Math.abs(Number(adjustDelta)));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr(safeT("point_fin_admin_amount_required", { fallbackKo: "금액을 입력하세요.", fallbackEn: "Enter an amount." }));
      return;
    }
    setErr("");
    const actionLabel =
      sign === -1
        ? safeT("point_fin_admin_debit", { fallbackKo: "차감", fallbackEn: "Debit" })
        : safeT("point_fin_admin_credit", { fallbackKo: "지급", fallbackEn: "Credit" });
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("payout"),
      ko: language !== "en",
      title: actionLabel,
      description: `${sign === -1 ? "-" : "+"}${formatAdminNumber(amount)} P${
        balance !== null ? `\n${formatAdminNumber(balance)} P → ${formatAdminNumber(balance + sign * amount)} P` : ""
      }`,
      confirmLabel: actionLabel,
      destructive: sign === -1,
    });
    if (!confirmed.ok) return;
    const reason = confirmed.reason?.trim() ?? "";
    if (!reason) return;
    await submitAdjust({ sign, amount, reason, idempotencyKey: `admin_point:${crypto.randomUUID()}` });
  };

  const submitAdjust = async (input: { sign: 1 | -1; amount: number; reason: string; idempotencyKey: string }) => {
    if (busy) return;
    const { sign, amount, reason, idempotencyKey } = input;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/points`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: sign * amount, reason, idempotencyKey }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; balance?: number };
      if (!res.ok || !j.ok) {
        setErr(resolveAdminApiErrorMessage(j.error, t, "admin_users_action_failed"));
        return;
      }
      setAdjustDelta("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading && items.length === 0) {
    return (
      <AdminCard titleKey="admin_users_points_title">
        <p className="sam-text-body-secondary text-sam-meta">{t("admin_dashboard_loading")}</p>
      </AdminCard>
    );
  }

  return (
    <AdminCard titleKey="admin_users_points_manage_title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-ui-rect bg-sam-info-soft px-4 py-3">
        <div>
          <p className="sam-text-helper text-sam-info">{t("admin_users_points_balance")}</p>
          <p className="sam-text-hero font-bold text-sam-info">
            {balanceUnavailable || balance === null
              ? t("admin_users_points_balance_unavailable")
              : `${formatAdminNumber(balance)}P`}
          </p>
          {summary ? (
            <p className="mt-1 sam-text-helper text-sam-info/80">
              +{formatAdminNumber(summary.totalCredit)}P / -{formatAdminNumber(summary.totalDebit)}P
              {summary.lastOccurredAt
                ? ` · ${formatAdminManilaDateTime(summary.lastOccurredAt)}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={adjustDelta}
          onChange={(e) => setAdjustDelta(e.target.value)}
          placeholder={safeT("point_fin_admin_amount_ph", { fallbackKo: "금액", fallbackEn: "Amount" })}
          className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
        <AdminActionButton variant="primary" disabled={busy} onClick={() => void openAdjustConfirm(1)}>
          {safeT("point_fin_admin_credit", { fallbackKo: "지급", fallbackEn: "Credit" })}
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled={busy} onClick={() => void openAdjustConfirm(-1)}>
          {safeT("point_fin_admin_debit", { fallbackKo: "차감", fallbackEn: "Debit" })}
        </AdminActionButton>
      </div>

      {err ? <p className="mb-2 sam-text-helper text-sam-danger">{err}</p> : null}

      <AdminTabs
        className="mb-3"
        ariaLabel={t("admin_users_points_manage_title")}
        tabs={[
          { id: "history", label: safeT("point_fin_tab_all", { fallbackKo: "회계 내역", fallbackEn: "Ledger" }) },
          { id: "charges", label: t("admin_users_points_tab_charges", { count: charges.length }) },
        ]}
        value={surface}
        syncUrl={false}
        onChange={(id) => setSurface(id === "charges" ? "charges" : "history")}
      />

      {surface === "history" ? (
        <>
          <div className="mb-3 flex gap-1">
            {([
              ["all", "전체"],
              ["credit", "충전/지급"],
              ["debit", "사용/차감"],
            ] as const).map(([id, ko]) => (
              <AdminChipButton key={id} selected={filter === id} onClick={() => setFilter(id)}>
                {id === "all"
                  ? safeT("point_fin_tab_all", { fallbackKo: ko, fallbackEn: "All" })
                  : id === "credit"
                    ? safeT("point_fin_tab_credit", { fallbackKo: ko, fallbackEn: "Credits" })
                    : safeT("point_fin_tab_debit", { fallbackKo: ko, fallbackEn: "Debits" })}
              </AdminChipButton>
            ))}
          </div>

          <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
            <table className="w-full min-w-[640px] border-collapse sam-text-body">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app">
                  <th className="px-3 py-2 text-left font-medium">일시</th>
                  <th className="px-3 py-2 text-left font-medium">구분</th>
                  <th className="px-3 py-2 text-left font-medium">사용처/내용</th>
                  <th className="px-3 py-2 text-right font-medium">증감</th>
                  <th className="px-3 py-2 text-right font-medium">잔액</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const title =
                    language === "en" ? item.fallbackTitleEn : item.fallbackTitleKo;
                  const usage = item.promotion
                    ? `${item.promotion.targetTitle} · ${
                        language === "en"
                          ? item.promotion.productLabelEn
                          : item.promotion.productLabelKo
                      }`
                    : item.subtitle || item.description;
                  return (
                    <tr
                      key={item.ledgerId}
                      className="cursor-pointer border-b border-sam-border-soft hover:bg-sam-app"
                      onClick={() => setSelected(item)}
                    >
                      <td className="whitespace-nowrap px-3 py-2 sam-text-helper text-sam-muted">
                        {formatAdminManilaDateTime(item.occurredAt)}
                      </td>
                      <td className="px-3 py-2">{title}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-sam-muted">{usage}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          item.direction === "credit" ? "text-sam-success" : "text-sam-danger"
                        }`}
                      >
                        {formatSigned(item.signedAmount)}
                      </td>
                      <td className="px-3 py-2 text-right">{formatAdminNumber(item.balanceAfter)}P</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items.length === 0 ? (
              <p className="py-8 text-center sam-text-helper text-sam-meta">
                {t("admin_users_points_ledger_empty")}
              </p>
            ) : null}
          </div>
          {hasMore ? (
            <AdminActionButton
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => void load({ append: true, cursor: nextCursor })}
            >
              {safeT("point_fin_load_more", { fallbackKo: "더 보기", fallbackEn: "Load more" })}
            </AdminActionButton>
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          {charges.length === 0 ? (
            <p className="py-4 text-center sam-text-helper text-sam-meta">
              {t("admin_users_points_charges_empty")}
            </p>
          ) : (
            charges.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between rounded-ui-rect border border-sam-border-soft px-3 py-3"
              >
                <div>
                  <p className="sam-text-body-secondary font-semibold">{c.planName}</p>
                  <p className="sam-text-helper text-sam-info font-bold">
                    +{formatAdminNumber(c.pointAmount)}P
                  </p>
                  <p className="sam-text-xxs text-sam-meta">
                    {formatAdminManilaDateTime(c.requestedAt)}
                  </p>
                </div>
                <PointChargeBadge status={c.requestStatus} />
              </div>
            ))
          )}
        </div>
      )}

      {selected ? (
        <DibayOverlayRoot open onClose={() => setSelected(null)} dismissible placement="center" zRole="dialog">
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[80vh] overflow-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={OverlayUi.title}>
              {language === "en" ? selected.fallbackTitleEn : selected.fallbackTitleKo}
            </h3>
            <p
              className={`mt-1 sam-text-page-title font-bold ${
                selected.direction === "credit" ? "text-sam-success" : "text-sam-danger"
              }`}
            >
              {formatSigned(selected.signedAmount)}
            </p>
            <dl className="mt-3 space-y-2 sam-text-body-secondary">
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">Ledger</dt>
                <dd className="break-all text-right font-mono sam-text-helper">{selected.ledgerId}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">Type</dt>
                <dd>
                  {selected.entryType} / {selected.relatedType}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sam-muted">Time</dt>
                <dd>{formatAdminManilaDateTime(selected.occurredAt)}</dd>
              </div>
              {selected.promotion ? (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sam-muted">Post</dt>
                    <dd className="text-right">{selected.promotion.targetTitle}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sam-muted">Product</dt>
                    <dd>
                      {language === "en"
                        ? selected.promotion.productLabelEn
                        : selected.promotion.productLabelKo}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sam-muted">Period</dt>
                    <dd className="text-right">
                      {formatAdminManilaDateTime(selected.promotion.startAt)} ~{" "}
                      {formatAdminManilaDateTime(selected.promotion.endAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sam-muted">Order</dt>
                    <dd className="break-all font-mono sam-text-helper">{selected.promotion.orderId}</dd>
                  </div>
                </>
              ) : null}
              {selected.deposit ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">Deposit</dt>
                  <dd className="text-right">
                    {selected.deposit.planName} · {adminStatusLabelText(POINTS_CHARGE_STATUS_NS, selected.deposit.requestStatus, ko)}
                  </dd>
                </div>
              ) : null}
              {selected.adjustment?.reason ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">Reason</dt>
                  <dd className="text-right">{selected.adjustment.reason}</dd>
                </div>
              ) : null}
            </dl>
            <div className={`${OverlayUi.actionsStack} mt-4`}>
              <DibayOverlayButton roleTone="primary" onClick={() => setSelected(null)}>
                {adminCta("close", ko)}
              </DibayOverlayButton>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}
    </AdminCard>
  );
}
