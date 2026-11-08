"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { CommissionPeriodFilter } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { PointChargePeriodSummaryLine, PointPeriodSummaryCard } from "@/components/points/PointPeriodSummary";
import type {
  PointChargeRequestPeriodSummary,
  PointChargeRequestsPage,
  PointPeriodSummary,
} from "@/lib/points/point-period-history";
import { manilaDateKey } from "@/lib/admin/metrics/manila-period";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import {
  ADMIN_USER_POINTS_PAGE_SIZE,
  adminUserPointsPeriodRangeLabel,
  buildAdminUserPointsQuery,
  type AdminUserPointsPeriodQuery,
} from "@/lib/admin/users/admin-user-points-query";

type PeriodQuery = AdminUserPointsPeriodQuery;

/** 기간 지정 기본값 = 필리핀 오늘 (정규 시간대 헬퍼 · V3-15). */
function manilaTodayDay(): string {
  return manilaDateKey(new Date().toISOString()) ?? "";
}

/** 쪽 크기 (AdminPagination 크기 타입) */
const PAGE_SIZE = ADMIN_USER_POINTS_PAGE_SIZE as AdminListPageSize;

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
  const [adjustDelta, setAdjustDelta] = useState("");
  const [selected, setSelected] = useState<PointFinancialHistoryItem | null>(null);
  /** 기간 (PHT) — 기본 이번 달. 회원 화면과 같은 API 값 (설계 H-8) */
  const [periodQ, setPeriodQ] = useState<PeriodQuery>({ period: "this_month", fromDay: "", toDay: "" });
  const [periodSummary, setPeriodSummary] = useState<PointPeriodSummary | null>(null);
  const [periodSummaryError, setPeriodSummaryError] = useState(false);
  /** 내역 쪽 (1부터) · 서버 전체 건수 — C-2: 「더 보기」 대신 쪽 이동 (섹션 내부 상태, 주소 키 없음) */
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);
  const [historyPaging, setHistoryPaging] = useState(false);
  const [chargePageNo, setChargePageNo] = useState(1);
  const [chargePage, setChargePage] = useState<Omit<PointChargeRequestsPage, "items"> | null>(null);
  const [chargeSummary, setChargeSummary] = useState<PointChargeRequestPeriodSummary | null>(null);
  const [chargePaging, setChargePaging] = useState(false);
  /**
   * R5-a — 응답 순서 보호. `replaceSeqRef` = 새 조건(기간·필터) 조회 번호(최신 것만 반영),
   * `genRef` = 조건 세대 — 쪽 이동 응답은 시작 때 세대와 같고 그 목록의 최신 요청일 때만 반영 (이전 기간 쪽이 새 기간에 섞이지 않게).
   */
  const replaceSeqRef = useRef(0);
  const genRef = useRef(0);
  const historySeqRef = useRef(0);
  const chargeSeqRef = useRef(0);

  const pointsUrl = useCallback(
    (qs: URLSearchParams) => `/api/admin/users/${encodeURIComponent(userId)}/points?${qs}`,
    [userId]
  );

  /** 기간·필터가 바뀌면(또는 지급/차감 뒤) 잔액·기간 합계·내역 1쪽·충전 신청 1쪽을 새로 읽는다. */
  const load = useCallback(async () => {
    genRef.current += 1;
    setLoading(true);
    const seq = ++replaceSeqRef.current;
    const stale = () => seq !== replaceSeqRef.current;
    setErr("");
    const resetAll = () => {
      setBalance(null);
      setBalanceUnavailable(true);
      setSummary(null);
      setItems([]);
      setCharges([]);
      setPeriodSummary(null);
      setChargeSummary(null);
      setChargePage(null);
      setHistoryTotal(null);
    };
    try {
      const qs = buildAdminUserPointsQuery({ section: "all", filter, periodQ, historyPage: 1, chargePage: 1, size: PAGE_SIZE });
      const res = await fetch(pointsUrl(qs), { credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        balance?: number;
        summary?: PointFinancialSummary;
        history?: { items?: PointFinancialHistoryItem[]; total?: number | null };
        chargeRequests?: PointChargeRequest[];
        periodSummary?: PointPeriodSummary | null;
        periodSummaryError?: boolean;
        chargeRequestsPage?: Omit<PointChargeRequestsPage, "items">;
        chargeSummary?: PointChargeRequestPeriodSummary | null;
      };
      if (stale()) return;
      setHistoryPage(1);
      setChargePageNo(1);
      if (!res.ok || j.ok === false) {
        setErr(resolveAdminApiErrorMessage(j.error, t, "admin_users_action_failed"));
        resetAll();
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
      setItems(Array.isArray(j.history?.items) ? j.history!.items! : []);
      setHistoryTotal(typeof j.history?.total === "number" ? j.history.total : null);
      setCharges(Array.isArray(j.chargeRequests) ? j.chargeRequests : []);
      setChargePage(j.chargeRequestsPage ?? null);
      setChargeSummary(j.chargeSummary ?? null);
      setPeriodSummary(j.periodSummary ?? null);
      setPeriodSummaryError(Boolean(j.periodSummaryError));
    } catch {
      if (stale()) return;
      setErr(resolveAdminApiErrorMessage("network_error", t, "admin_users_action_failed"));
      resetAll();
    } finally {
      if (seq === replaceSeqRef.current) setLoading(false);
    }
  }, [filter, periodQ, pointsUrl, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 내역 쪽 이동 — 같은 기간·필터의 그 쪽만 (서버 offset + 전체 건수) */
  const goHistoryPage = async (page: number) => {
    if (loading) return;
    const gen = genRef.current;
    const seq = ++historySeqRef.current;
    const stale = () => gen !== genRef.current || seq !== historySeqRef.current;
    setHistoryPaging(true);
    setErr("");
    try {
      const qs = buildAdminUserPointsQuery({ section: "history", filter, periodQ, historyPage: page, size: PAGE_SIZE });
      const res = await fetch(pointsUrl(qs), { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        history?: { items?: PointFinancialHistoryItem[]; total?: number | null };
      };
      if (stale()) return;
      if (!res.ok || !j.ok) {
        setErr(resolveAdminApiErrorMessage(j.error, t, "admin_users_action_failed"));
        return;
      }
      setItems(Array.isArray(j.history?.items) ? j.history!.items! : []);
      if (typeof j.history?.total === "number") setHistoryTotal(j.history.total);
      setHistoryPage(page);
    } catch {
      if (!stale()) setErr(resolveAdminApiErrorMessage("network_error", t, "admin_users_action_failed"));
    } finally {
      if (seq === historySeqRef.current) setHistoryPaging(false);
    }
  };

  /** 충전 신청 쪽 이동 — 같은 기간의 그 쪽만 */
  const goChargePage = async (page: number) => {
    if (loading) return;
    const gen = genRef.current;
    const seq = ++chargeSeqRef.current;
    const stale = () => gen !== genRef.current || seq !== chargeSeqRef.current;
    setChargePaging(true);
    setErr("");
    try {
      const qs = buildAdminUserPointsQuery({ section: "charges", filter, periodQ, chargePage: page, size: PAGE_SIZE });
      const res = await fetch(pointsUrl(qs), { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        chargeRequests?: PointChargeRequest[];
        chargeRequestsPage?: Omit<PointChargeRequestsPage, "items">;
      };
      if (stale()) return;
      if (!res.ok || !j.ok) {
        setErr(resolveAdminApiErrorMessage(j.error, t, "admin_users_action_failed"));
        return;
      }
      setCharges(Array.isArray(j.chargeRequests) ? j.chargeRequests : []);
      if (j.chargeRequestsPage) setChargePage(j.chargeRequestsPage);
      setChargePageNo(page);
    } catch {
      if (!stale()) setErr(resolveAdminApiErrorMessage("network_error", t, "admin_users_action_failed"));
    } finally {
      if (seq === chargeSeqRef.current) setChargePaging(false);
    }
  };
  const lang = ko ? "ko" : "en";

  /**
   * 지급/차감 = payout(L2) — 확인 + 사유. 사유는 확인창에서 받아 그대로 API(`reason`)로 보낸다 (원장 설명·감사 기록).
   * 멱등 키는 확인 1회당 1개 (같은 확인에서 여러 번 눌러도 1건만 반영).
   */
  const openAdjustConfirm = async (sign: 1 | -1) => {
    if (busy) return;
    const amount = Math.trunc(Math.abs(Number(adjustDelta)));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr(safeT("point_fin_admin_amount_required"));
      return;
    }
    setErr("");
    const actionLabel =
      sign === -1
        ? safeT("point_fin_admin_debit")
        : safeT("point_fin_admin_credit");
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
              {/* 전체 기간 적립/사용 합계는 아래 기간 합계(「전체 기간」 선택)로 대체 — 여기는 마지막 거래 시각만 */}
              {summary.lastOccurredAt
                ? `${t("admin_users_last_activity")} ${formatAdminManilaDateTime(summary.lastOccurredAt)}`
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
          placeholder={safeT("point_fin_admin_amount_ph")}
          className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
        <AdminActionButton variant="primary" disabled={busy} onClick={() => void openAdjustConfirm(1)}>
          {safeT("point_fin_admin_credit")}
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled={busy} onClick={() => void openAdjustConfirm(-1)}>
          {safeT("point_fin_admin_debit")}
        </AdminActionButton>
      </div>

      {err ? <p className="mb-2 sam-text-helper text-sam-danger">{err}</p> : null}

      {/* 기간 (PHT) + 기간 합계 — 회원 화면과 같은 서버 함수 (설계 H-8) */}
      <div className="mb-3 space-y-2">
        <CommissionPeriodFilter
          period={periodQ.period}
          fromDay={periodQ.fromDay}
          toDay={periodQ.toDay}
          lang={lang}
          onChange={(next) => {
            const today = manilaTodayDay();
            setPeriodQ(
              next.period === "custom"
                ? { period: "custom", fromDay: next.fromDay || today, toDay: next.toDay || today }
                : { period: next.period, fromDay: "", toDay: "" }
            );
          }}
        />
        {/* 조건을 바꾸는 동안 이전 기간 합계를 보이지 않는다 (R5-a) */}
        {loading ? (
          <p role="status" className="sam-text-helper text-sam-muted" data-admin-user-points-loading="1">
            {t("admin_dashboard_loading")}
          </p>
        ) : (
          <>
            {periodSummary ? (
              <p className="sam-text-helper text-sam-muted" data-admin-user-points-period-range="1">
                {t("admin_users_period_totals_whole_period", {
                  range: String(adminUserPointsPeriodRangeLabel(periodSummary, ko)),
                })}
              </p>
            ) : null}
            <PointPeriodSummaryCard summary={periodSummary} error={periodSummaryError} lang={lang} />
          </>
        )}
      </div>

      <AdminTabs
        className="mb-3"
        ariaLabel={t("admin_users_points_manage_title")}
        tabs={[
          { id: "history", label: safeT("point_fin_tab_all") },
          {
            id: "charges",
            label: t("admin_users_points_tab_charges", { count: chargePage?.total ?? charges.length }),
          },
        ]}
        value={surface}
        syncUrl={false}
        onChange={(id) => setSurface(id === "charges" ? "charges" : "history")}
      />

      {surface === "history" ? (
        <>
          <div className="mb-3 flex gap-1">
            {(["all", "credit", "debit"] as const).map((id) => (
              <AdminChipButton key={id} selected={filter === id} onClick={() => setFilter(id)}>
                {id === "all"
                  ? safeT("point_fin_tab_all")
                  : id === "credit"
                    ? safeT("point_fin_tab_credit")
                    : safeT("point_fin_tab_debit")}
              </AdminChipButton>
            ))}
          </div>

          <div
            className={`overflow-x-auto rounded-ui-rect border border-sam-border ${loading || historyPaging ? "opacity-50" : ""}`}
            aria-busy={loading || historyPaging}
          >
            <table className="w-full min-w-[640px] border-collapse sam-text-body">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app">
                  <th className="px-3 py-2 text-left font-medium">{t("admin_users_points_col_date")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("admin_users_points_col_type")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("admin_users_points_col_details")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("admin_users_points_col_change")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("admin_users_points_col_balance")}</th>
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
          {historyTotal != null && historyTotal > 0 ? (
            <AdminPagination
              ko={ko}
              page={historyPage}
              size={PAGE_SIZE}
              total={historyTotal}
              onPageChange={(p) => void goHistoryPage(p)}
              disabled={loading || historyPaging}
            />
          ) : null}
        </>
      ) : (
        <div className={`space-y-2 ${loading || chargePaging ? "opacity-50" : ""}`} aria-busy={loading || chargePaging}>
          {chargeSummary && !loading ? <PointChargePeriodSummaryLine summary={chargeSummary} lang={lang} /> : null}
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
                    {t("admin_users_requested_2")} {formatAdminManilaDateTime(c.requestedAt)}
                    {c.requestStatus !== "pending" && c.requestStatus !== "waiting_confirm" && (c.processedAt || c.approvedAt)
                      ? ` · ${t("admin_users_processed")} ${formatAdminManilaDateTime(c.processedAt || c.approvedAt)}`
                      : ""}
                  </p>
                  {/* R6-g — 반려 사유를 줄에 바로 */}
                  {c.requestStatus === "rejected" ? (
                    <p className="sam-text-xxs text-sam-fg" data-admin-user-point-charge-reject-reason="1">
                      {t("admin_users_reject_reason")}: {c.rejectReason?.trim() || "—"}
                    </p>
                  ) : null}
                </div>
                <PointChargeBadge status={c.requestStatus} />
              </div>
            ))
          )}
          {chargePage && chargePage.total > 0 ? (
            <AdminPagination
              ko={ko}
              page={chargePageNo}
              size={PAGE_SIZE}
              total={chargePage.total}
              onPageChange={(p) => void goChargePage(p)}
              disabled={loading || chargePaging}
            />
          ) : null}
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
