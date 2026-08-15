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
import type { AppLanguageCode } from "@/lib/i18n/config";

interface AdminUserPointsSectionProps {
  userId: string;
}

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

function formatSigned(signed: number): string {
  const abs = Math.abs(signed).toLocaleString();
  return signed < 0 ? `-${abs} P` : `+${abs} P`;
}

export function AdminUserPointsSection({ userId }: AdminUserPointsSectionProps) {
  const { t, language, safeT } = useI18n();
  const dateLocale = dateLocaleTag(language);
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
  const [adjustReason, setAdjustReason] = useState("");
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

  const submitAdjust = async (sign: 1 | -1) => {
    const amount = Math.trunc(Math.abs(Number(adjustDelta)));
    const reason = adjustReason.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr(safeT("point_fin_admin_amount_required", { fallbackKo: "금액을 입력하세요.", fallbackEn: "Enter an amount." }));
      return;
    }
    if (!reason) {
      setErr(safeT("point_fin_admin_reason_required", { fallbackKo: "사유를 입력하세요.", fallbackEn: "Enter a reason." }));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/points`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: sign * amount, reason }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; balance?: number };
      if (!res.ok || !j.ok) {
        setErr(resolveAdminApiErrorMessage(j.error, t, "admin_users_action_failed"));
        return;
      }
      setAdjustDelta("");
      setAdjustReason("");
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-ui-rect bg-sky-50 px-4 py-3">
        <div>
          <p className="sam-text-helper text-sky-700">{t("admin_users_points_balance")}</p>
          <p className="sam-text-hero font-bold text-sky-800">
            {balanceUnavailable || balance === null
              ? t("admin_users_points_balance_unavailable")
              : `${balance.toLocaleString()}P`}
          </p>
          {summary ? (
            <p className="mt-1 sam-text-helper text-sky-800/80">
              +{summary.totalCredit.toLocaleString()}P / -{summary.totalDebit.toLocaleString()}P
              {summary.lastOccurredAt
                ? ` · ${new Date(summary.lastOccurredAt).toLocaleString(dateLocale)}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={adjustDelta}
          onChange={(e) => setAdjustDelta(e.target.value)}
          placeholder={safeT("point_fin_admin_amount_ph", { fallbackKo: "금액", fallbackEn: "Amount" })}
          className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
        <input
          type="text"
          value={adjustReason}
          onChange={(e) => setAdjustReason(e.target.value)}
          placeholder={safeT("point_fin_admin_reason_ph", { fallbackKo: "사유 (필수)", fallbackEn: "Reason (required)" })}
          className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void submitAdjust(1)}
          className="rounded-ui-rect bg-emerald-600 px-3 py-2 sam-text-helper font-semibold text-white disabled:opacity-50"
        >
          {safeT("point_fin_admin_credit", { fallbackKo: "지급", fallbackEn: "Credit" })}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submitAdjust(-1)}
          className="rounded-ui-rect bg-red-600 px-3 py-2 sam-text-helper font-semibold text-white disabled:opacity-50"
        >
          {safeT("point_fin_admin_debit", { fallbackKo: "차감", fallbackEn: "Debit" })}
        </button>
      </div>

      {err ? <p className="mb-2 sam-text-helper text-red-600">{err}</p> : null}

      <div className="mb-3 flex gap-1 rounded-ui-rect bg-sam-surface-muted p-1">
        {(["history", "charges"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSurface(key)}
            className={`flex-1 rounded-ui-rect py-1.5 sam-text-helper font-semibold ${
              surface === key ? "bg-sam-surface text-sam-fg shadow-sm" : "text-sam-muted"
            }`}
          >
            {key === "history"
              ? safeT("point_fin_tab_all", { fallbackKo: "회계 내역", fallbackEn: "Ledger" })
              : t("admin_users_points_tab_charges", { count: charges.length })}
          </button>
        ))}
      </div>

      {surface === "history" ? (
        <>
          <div className="mb-3 flex gap-1">
            {([
              ["all", "전체"],
              ["credit", "충전/지급"],
              ["debit", "사용/차감"],
            ] as const).map(([id, ko]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-full px-3 py-1 sam-text-helper font-semibold ${
                  filter === id ? "bg-signature text-white" : "bg-sam-surface-muted text-sam-muted"
                }`}
              >
                {id === "all"
                  ? safeT("point_fin_tab_all", { fallbackKo: ko, fallbackEn: "All" })
                  : id === "credit"
                    ? safeT("point_fin_tab_credit", { fallbackKo: ko, fallbackEn: "Credits" })
                    : safeT("point_fin_tab_debit", { fallbackKo: ko, fallbackEn: "Debits" })}
              </button>
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
                        {new Date(item.occurredAt).toLocaleString(dateLocale)}
                      </td>
                      <td className="px-3 py-2">{title}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-sam-muted">{usage}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          item.direction === "credit" ? "text-emerald-700" : "text-red-600"
                        }`}
                      >
                        {formatSigned(item.signedAmount)}
                      </td>
                      <td className="px-3 py-2 text-right">{item.balanceAfter.toLocaleString()}P</td>
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
            <button
              type="button"
              className="mt-2 w-full rounded-ui-rect border border-sam-border py-2 sam-text-helper"
              onClick={() => void load({ append: true, cursor: nextCursor })}
            >
              {safeT("point_fin_load_more", { fallbackKo: "더 보기", fallbackEn: "Load more" })}
            </button>
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
                  <p className="sam-text-helper text-sky-700 font-bold">
                    +{c.pointAmount.toLocaleString()}P
                  </p>
                  <p className="sam-text-xxs text-sam-meta">
                    {new Date(c.requestedAt).toLocaleString(dateLocale)}
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
                selected.direction === "credit" ? "text-emerald-700" : "text-red-600"
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
                <dd>{new Date(selected.occurredAt).toLocaleString(dateLocale)}</dd>
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
                      {new Date(selected.promotion.startAt).toLocaleString(dateLocale)} ~{" "}
                      {new Date(selected.promotion.endAt).toLocaleString(dateLocale)}
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
                    {selected.deposit.planName} · {selected.deposit.requestStatus}
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
                {t("common_confirm")}
              </DibayOverlayButton>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}
    </AdminCard>
  );
}
