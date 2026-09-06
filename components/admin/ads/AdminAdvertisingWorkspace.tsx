"use client";

/**
 * Canonical Ads / Exposure shell — /admin/advertising
 * Aggregates control-plane rows; mutations via existing family writers + deep-links.
 * Menu leaf reduction is NOT in scope.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminAdvertisingAuthorityNav } from "@/components/admin/ads/AdminAdvertisingAuthorityNav";
import type { AdsActionItem, AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";
import { fetchAdsControlPlane } from "@/lib/admin/ads-control-plane/fetch-ads-control-plane";
import {
  familyFromControlDomain,
  listWorkspaceDrawerActions,
  parseWorkspaceEntityId,
  type WorkspaceDrawerAction,
} from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import { ADS_FEEDBACK } from "@/lib/admin/ads-exposure/action-feedback";
import {
  filterShellRowsByProductFamily,
  filterShellRowsByTab,
  toAdsShellListRow,
  type AdsShellListRow,
  type AdsShellProductFamily,
  type AdsShellStatusTab,
} from "@/lib/admin/ads-exposure/shell-row";
import { BANNER_PLACEMENT_CAPACITY_SSOT } from "@/lib/ads/banner-placement-capacity-ssot";
import { Sam } from "@/lib/ui/sam-component-classes";

type AdvertisingWorkspaceMode = "all" | "applications" | "operations" | "history";

const STATUS_TABS: Array<{ id: AdsShellStatusTab; ko: string; en: string }> = [
  { id: "all", ko: "전체", en: "All" },
  { id: "pending", ko: "승인 대기", en: "Pending" },
  { id: "incomplete", ko: "불완전/임시", en: "Incomplete" },
  { id: "scheduled", ko: "예약", en: "Scheduled" },
  { id: "live", ko: "노출 중", en: "Live" },
  { id: "waiting", ko: "노출 대기", en: "Waiting" },
  { id: "paused", ko: "일시중지", en: "Paused" },
  { id: "ended", ko: "종료", en: "Ended" },
  { id: "rejected", ko: "반려", en: "Rejected" },
];

const FAMILY_TABS: Array<{ id: AdsShellProductFamily; ko: string; en: string }> = [
  { id: "all", ko: "전체 종류", en: "All kinds" },
  { id: "promote", ko: "상위 노출", en: "Promote" },
  { id: "banner", ko: "배너", en: "Banner" },
  { id: "sponsored", ko: "매장 홍보", en: "Store promote" },
  { id: "popup", ko: "팝업", en: "Popup" },
];

const ACTION_LABEL: Record<WorkspaceDrawerAction, { ko: string; en: string }> = {
  approve: { ko: "승인", en: "Approve" },
  reject: { ko: "반려", en: "Reject" },
  request_changes: { ko: "보류", en: "Hold" },
  pause: { ko: "일시중지", en: "Pause" },
  resume: { ko: "다시 노출", en: "Resume" },
  end: { ko: "종료", en: "End" },
  terminate: { ko: "강제 종료", en: "Terminate" },
  delete_safe_draft: { ko: "삭제", en: "Delete draft" },
  add_internal_memo: { ko: "내부 메모", en: "Internal memo" },
  extend_compensation: { ko: "기간 연장", en: "Extend period" },
  change_period: { ko: "기간 변경", en: "Change period" },
};

function feedbackForAction(action: WorkspaceDrawerAction, ko: boolean): string {
  if (action === "approve") return ko ? ADS_FEEDBACK.approved.ko : ADS_FEEDBACK.approved.en;
  if (action === "reject") return ko ? ADS_FEEDBACK.rejected.ko : ADS_FEEDBACK.rejected.en;
  if (action === "pause") return ko ? ADS_FEEDBACK.paused.ko : ADS_FEEDBACK.paused.en;
  if (action === "resume") return ko ? ADS_FEEDBACK.resumed.ko : ADS_FEEDBACK.resumed.en;
  if (action === "end" || action === "terminate") {
    return ko ? ADS_FEEDBACK.ended.ko : ADS_FEEDBACK.ended.en;
  }
  if (action === "delete_safe_draft") return ko ? ADS_FEEDBACK.deleted.ko : ADS_FEEDBACK.deleted.en;
  if (action === "change_period") return ko ? "기간을 저장했습니다." : "Period saved.";
  return ko ? ADS_FEEDBACK.updated.ko : ADS_FEEDBACK.updated.en;
}

function resolveFamily(item: AdsActionItem) {
  return familyFromControlDomain(item.domain, item.product, {
    id: item.id,
    source: item.source,
  });
}

function collectPool(model: AdsControlPlaneModel): AdsActionItem[] {
  const pool = [
    ...model.actionRequired,
    ...model.applications,
    ...model.creatives,
    ...model.recent,
    ...model.currentExecution.map(
      (e): AdsActionItem => ({
        id: e.id,
        domain: e.domain,
        product: e.product,
        entity: "execution",
        applicantLabel: e.label,
        storeId: null,
        memberId: null,
        creativeHint: null,
        placementHint: e.placement,
        amountLabel: null,
        currency: e.currency,
        status: e.status,
        whyActionable: e.eligibility,
        paymentLabel: null,
        periodLabel: e.period,
        remainingLabel: e.remainingLabel,
        exposureLabel: e.eligibility,
        eligibility: e.eligibility,
        ageHours: null,
        at: model.generatedAt,
        source: e.source,
        href: e.href,
        statementHref: e.statementHref,
        financeHref: null,
        memberHref: null,
      })
    ),
  ];
  const seen = new Set<string>();
  const uniq: AdsActionItem[] = [];
  for (const r of pool) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    uniq.push(r);
  }
  return uniq;
}

function defaultStatusTabForMode(mode: AdvertisingWorkspaceMode): AdsShellStatusTab {
  if (mode === "history") return "ended";
  if (mode === "applications") return "pending";
  if (mode === "operations") return "live";
  return "all";
}

function modeTitle(mode: AdvertisingWorkspaceMode, ko: boolean): string {
  if (mode === "operations") return ko ? "노출 관리" : "Exposure operations";
  if (mode === "applications") return ko ? "광고 신청" : "Ad applications";
  if (mode === "history") return ko ? "광고 이력" : "Ads history";
  return ko ? "전체 광고" : "All ads";
}

function modeDescription(mode: AdvertisingWorkspaceMode, ko: boolean): string {
  if (mode === "operations") {
    return ko
      ? "승인되어 캠페인이 생성된 광고만 운영합니다. 신청 승인/반려 action은 이 화면에서 제공하지 않습니다."
      : "Operate approved campaigns only. Application approval actions are not exposed here.";
  }
  if (mode === "applications") {
    return ko
      ? "승인 전 광고 신청만 처리합니다. 승인된 캠페인의 기간 변경·중지·재개·종료는 노출 관리에서 처리합니다."
      : "Handle pre-approval applications only. Approved campaign operations move to Operations.";
  }
  if (mode === "history") {
    return ko
      ? "종료·반려·취소된 광고 변경 이력을 확인합니다. 신규 운영 action은 제공하지 않습니다."
      : "Review ended, rejected, and cancelled ad history. New operation actions are not exposed.";
  }
  return ko
    ? "전체 광고를 검색하고 올바른 신청·운영·위치 authority로 진입합니다."
    : "Search all ads and enter the correct application, operation, or placement authority.";
}

function filterRowsByMode(rows: AdsShellListRow[], mode: AdvertisingWorkspaceMode): AdsShellListRow[] {
  if (mode === "operations") {
    return rows.filter(
      (r) =>
        (r.applicationStatusLabel === "—" ||
          (r.domain === "popup" && String(r.id).startsWith("popup_campaign:"))) &&
        ["scheduled", "live", "waiting", "paused", "incomplete"].includes(r.statusTab)
    );
  }
  if (mode === "applications") {
    return rows.filter(
      (r) =>
        !(r.domain === "popup" && String(r.id).startsWith("popup_campaign:")) &&
        r.applicationStatusLabel !== "—" &&
        ["pending", "incomplete", "rejected"].includes(r.statusTab)
    );
  }
  if (mode === "history") {
    return rows.filter((r) => r.statusTab === "ended" || r.statusTab === "rejected");
  }
  return rows;
}

function filterActionsByMode(
  actions: WorkspaceDrawerAction[],
  mode: AdvertisingWorkspaceMode
): WorkspaceDrawerAction[] {
  if (mode === "applications") {
    return actions.filter((a) => ["approve", "reject", "request_changes", "add_internal_memo"].includes(a));
  }
  if (mode !== "operations") return [];
  return actions.filter((a) =>
    ["change_period", "pause", "resume", "end", "terminate", "add_internal_memo", "extend_compensation"].includes(a)
  );
}

export function AdminAdvertisingWorkspace({ mode = "all" }: { mode?: AdvertisingWorkspaceMode }) {
  const { language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<AdsControlPlaneModel | null>(null);
  const [err, setErr] = useState("");
  const [statusTab, setStatusTab] = useState<AdsShellStatusTab>(() => defaultStatusTabForMode(mode));
  const [family, setFamily] = useState<AdsShellProductFamily>("all");
  const [selected, setSelected] = useState<AdsActionItem | null>(null);
  const [manageOpenId, setManageOpenId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [publicMessage, setPublicMessage] = useState("");
  const [internalMemo, setInternalMemo] = useState("");
  const [extendDays, setExtendDays] = useState(1);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const result = await fetchAdsControlPlane();
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setModel(result.plane);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shellRows = useMemo(() => {
    if (!model) return [] as AdsShellListRow[];
    const items = collectPool(model);
    let rows = items.map((i) => toAdsShellListRow(i, ko));
    rows = filterRowsByMode(rows, mode);
    rows = filterShellRowsByProductFamily(rows, family);
    rows = filterShellRowsByTab(rows, statusTab);
    return rows;
  }, [model, ko, mode, family, statusTab]);

  const itemById = useMemo(() => {
    const map = new Map<string, AdsActionItem>();
    if (!model) return map;
    for (const i of collectPool(model)) map.set(i.id, i);
    return map;
  }, [model]);

  const summary = useMemo(() => {
    if (!model) {
      return {
        pending: 0,
        live: 0,
        waiting: 0,
        incomplete: 0,
        scheduled: 0,
        vacant: 0,
        heroCap: 5,
      };
    }
    const all = collectPool(model).map((i) => toAdsShellListRow(i, ko));
    const scoped = filterRowsByMode(all, mode);
    const hero = model.occupancy?.find((o) => o.placementKey === "STORES_HOME_HERO");
    return {
      pending: scoped.filter((r) => r.statusTab === "pending").length,
      live: scoped.filter((r) => r.statusTab === "live").length,
      waiting: scoped.filter((r) => r.statusTab === "waiting").length,
      incomplete: scoped.filter((r) => r.statusTab === "incomplete").length,
      scheduled: scoped.filter((r) => r.statusTab === "scheduled").length,
      vacant: hero?.vacant ?? 0,
      heroCap:
        hero?.capacity ?? BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.defaultCapacity,
    };
  }, [model, ko, mode]);

  const popupQueue = useMemo(() => {
    if (!model) return [] as Array<{
      surface: string;
      live: AdsShellListRow[];
      waiting: AdsShellListRow[];
      incomplete: AdsShellListRow[];
      scheduled: AdsShellListRow[];
    }>;
    const popupRows = collectPool(model)
      .filter((i) => i.domain === "popup" && String(i.id).startsWith("popup_campaign:"))
      .map((i) => toAdsShellListRow(i, ko));
    const bySurface = new Map<string, AdsShellListRow[]>();
    for (const row of popupRows) {
      const key = row.placementLabel || "팝업";
      const list = bySurface.get(key) ?? [];
      list.push(row);
      bySurface.set(key, list);
    }
    return [...bySurface.entries()].map(([surface, rows]) => ({
      surface,
      live: rows.filter((r) => r.statusTab === "live"),
      waiting: rows.filter((r) => r.statusTab === "waiting"),
      incomplete: rows.filter((r) => r.statusTab === "incomplete"),
      scheduled: rows.filter((r) => r.statusTab === "scheduled"),
    }));
  }, [model, ko]);

  const runDrawerAction = useCallback(
    async (action: WorkspaceDrawerAction, rowItem: AdsActionItem) => {
      const fam = resolveFamily(rowItem);
      if (!fam) {
        setActionMsg(ko ? "이 행은 관리 액션이 없습니다." : "No manage actions for this row.");
        return;
      }
      if (action === "change_period") {
        if (!periodStart.trim() || !periodEnd.trim()) {
          setActionMsg(ko ? "시작·종료 일시를 입력하세요." : "Enter start and end.");
          return;
        }
      }
      setBusyAction(action);
      setActionMsg("");
      try {
        if (action === "extend_compensation" && !publicMessage.trim()) {
          setActionMsg(ko ? "연장 사유가 필요합니다." : "Extend reason required.");
          setBusyAction(null);
          return;
        }
        const res = await fetch("/api/admin/advertising-workspace/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            family: fam,
            entityId: parseWorkspaceEntityId(rowItem.id),
            action,
            reason: publicMessage || undefined,
            publicMessage: publicMessage || undefined,
            internalMemo: action === "add_internal_memo" ? internalMemo : undefined,
            requestedDays: action === "extend_compensation" ? extendDays : undefined,
            extensionKind:
              action === "extend_compensation" ? "ADMIN_FREE_COMPENSATION" : undefined,
            startAt:
              action === "change_period" ? new Date(periodStart).toISOString() : undefined,
            endAt: action === "change_period" ? new Date(periodEnd).toISOString() : undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setActionMsg(
            j.error === "capacity_full"
              ? ko
                ? ADS_FEEDBACK.capacityFull.ko
                : ADS_FEEDBACK.capacityFull.en
              : j.error ?? (ko ? ADS_FEEDBACK.saveFailed.ko : ADS_FEEDBACK.saveFailed.en)
          );
          return;
        }
        setActionMsg(feedbackForAction(action, ko));
        setPublicMessage("");
        setInternalMemo("");
        setManageOpenId(null);
        await load();
      } catch {
        setActionMsg(ko ? ADS_FEEDBACK.saveFailed.ko : ADS_FEEDBACK.saveFailed.en);
      } finally {
        setBusyAction(null);
      }
    },
    [publicMessage, internalMemo, extendDays, periodStart, periodEnd, load, ko]
  );

  const selectedFamily = selected ? resolveFamily(selected) : null;
  const selectedActions =
    selected && selectedFamily
      ? filterActionsByMode(
          listWorkspaceDrawerActions({
            family: selectedFamily,
            statusRaw: selected.status,
          }),
          mode
        )
      : [];
  const selectedShell = selected ? toAdsShellListRow(selected, ko) : null;

  return (
    <div
      className="space-y-4"
      data-admin-advertising-shell="1"
      data-admin-advertising-workspace="1"
      data-admin-advertising-mode={mode}
    >
      <AdminAdvertisingAuthorityNav />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-sam-fg">
            {modeTitle(mode, ko)}
          </h1>
          <p className="text-[13px] text-sam-muted">
            {modeDescription(mode, ko)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/advertising/direct"
            className={`${Sam.btn.primary} min-h-12 px-6 text-base font-bold shadow-sm`}
            data-admin-ads-register-cta="1"
          >
            {ko ? "+ 광고 등록" : "+ Register ad"}
          </Link>
          <Link
            href="/admin/advertising/placements"
            className={Sam.btn.secondary}
            data-admin-ads-placement-cta="1"
          >
            {ko ? "광고 위치 관리" : "Ad placements"}
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-shell-summary="1">
        {(
          [
            ["pending", ko ? "승인 대기" : "Pending", summary.pending],
            ["live", ko ? "노출 중" : "Live", summary.live],
            ["waiting", ko ? "노출 대기" : "Waiting", summary.waiting],
            ["incomplete", ko ? "불완전/임시" : "Incomplete", summary.incomplete],
            ["scheduled", ko ? "예약" : "Scheduled", summary.scheduled],
            [
              "hero",
              ko
                ? `홈 배너 ${summary.heroCap - summary.vacant}/${summary.heroCap}`
                : `Hero ${summary.heroCap - summary.vacant}/${summary.heroCap}`,
              summary.vacant,
            ],
          ] as const
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-left"
            onClick={() => {
              if (
                key === "pending" ||
                key === "live" ||
                key === "waiting" ||
                key === "incomplete" ||
                key === "scheduled"
              ) {
                setStatusTab(key);
              }
            }}
          >
            <div className="text-[11px] text-sam-muted">{label}</div>
            <div className="text-lg font-semibold tabular-nums text-sam-fg">
              {key === "hero"
                ? `${summary.heroCap - summary.vacant}/${summary.heroCap}`
                : value}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-shell-status-tabs="1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-ui-rect border px-3 py-1.5 text-sm ${
              statusTab === t.id
                ? "border-sam-brand bg-sam-brand/10 font-semibold text-sam-fg"
                : "border-sam-border bg-sam-surface text-sam-muted"
            }`}
            data-status-tab={t.id}
            onClick={() => setStatusTab(t.id)}
          >
            {ko ? t.ko : t.en}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-shell-family-tabs="1">
        {FAMILY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-ui-rect border px-2.5 py-1 text-sm ${
              family === t.id
                ? "border-sam-brand bg-sam-brand/10 font-semibold"
                : "border-sam-border bg-sam-app text-sam-muted"
            }`}
            data-family-tab={t.id}
            onClick={() => setFamily(t.id)}
          >
            {ko ? t.ko : t.en}
          </button>
        ))}
      </div>

      {family === "popup" && popupQueue.length > 0 ? (
        <section
          className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-popup-occupancy-queue="1"
        >
          <h2 className="text-sm font-semibold text-sam-fg">
            {ko ? "팝업 위치별 점유" : "Popup occupancy by surface"}
          </h2>
          {popupQueue.map((q) => (
            <div key={q.surface} className="rounded-ui-rect border border-sam-border bg-sam-app p-2 text-[12px]">
              <div className="font-medium text-sam-fg">{q.surface}</div>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                <div>
                  <div className="text-sam-muted">
                    {ko ? `현재 노출 중 ${q.live.length}건` : `Live ${q.live.length}`}
                  </div>
                  {q.live.map((r) => (
                    <div key={r.id} className="truncate text-sam-fg">
                      {r.title}
                    </div>
                  ))}
                  {q.live.length === 0 ? <div className="text-sam-muted">—</div> : null}
                </div>
                <div>
                  <div className="text-sam-muted">
                    {ko ? `노출 대기 ${q.waiting.length}건` : `Waiting ${q.waiting.length}`}
                  </div>
                  {q.waiting.map((r) => (
                    <div key={r.id} className="truncate text-sam-fg">
                      {r.title}
                    </div>
                  ))}
                  {q.waiting.length === 0 ? <div className="text-sam-muted">—</div> : null}
                </div>
                <div>
                  <div className="text-sam-muted">
                    {ko ? `불완전 ${q.incomplete.length}건` : `Incomplete ${q.incomplete.length}`}
                  </div>
                </div>
                <div>
                  <div className="text-sam-muted">
                    {ko ? `예약 ${q.scheduled.length}건` : `Scheduled ${q.scheduled.length}`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {err ? (
        <p className="text-sm text-sam-danger" role="alert">
          {err}
        </p>
      ) : null}
      {actionMsg ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm" role="status">
          {actionMsg}
        </p>
      ) : null}

      <div className="grid gap-4">
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-[12px]" data-shell-table="1">
            <thead className="bg-sam-app text-sam-muted">
              <tr>
                <th className="px-2 py-2 font-medium">{ko ? "종류" : "Kind"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "신청자" : "Applicant"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "회원/매장" : "Member/Store"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "광고 대상" : "Target"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "노출 위치" : "Placement"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "배너 상세" : "Banner detail"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "기간" : "Period"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "금액" : "Amount"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "결제" : "Pay"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "신청 상태" : "Application"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "운영 상태" : "Campaign"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "실제 노출" : "Runtime"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "관리" : "Manage"}</th>
              </tr>
            </thead>
            <tbody>
              {shellRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-sam-muted">
                    {ko ? "표시할 광고가 없습니다." : "No ads in this filter."}
                  </td>
                </tr>
              ) : (
                shellRows.map((r) => {
                  const item = itemById.get(r.id);
                  const fam = item ? resolveFamily(item) : null;
                  const actions =
                    item && fam
                      ? filterActionsByMode(
                          listWorkspaceDrawerActions({
                            family: fam,
                            statusRaw: item.status,
                          }),
                          mode
                        )
                      : [];
                  const open = manageOpenId === r.id;
                  return (
                    <tr key={r.id} className="border-t border-sam-border align-top">
                      <td className="px-2 py-2">
                        <div className="flex min-w-[150px] items-center gap-2">
                          {r.creativeImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- operator creative thumbnail
                            <img
                              src={r.creativeImageUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-ui-rect object-cover"
                            />
                          ) : (
                            <span className="h-10 w-10 shrink-0 rounded-ui-rect bg-sam-border/40" />
                          )}
                          <span>
                            <span className="block font-medium text-sam-fg">{r.kindLabel}</span>
                            <span className="block max-w-[170px] truncate text-[11px] text-sam-muted">
                              {r.title}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2">{r.applicantLabel}</td>
                      <td className="px-2 py-2">{r.memberOrStore}</td>
                      <td className="px-2 py-2 max-w-[140px] truncate">{r.targetLabel}</td>
                      <td className="px-2 py-2">{r.placementLabel}</td>
                      <td className="px-2 py-2">{r.slideLabel ? r.slideLabel.split(">").pop()?.trim() : "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{r.periodLabel}</td>
                      <td className="px-2 py-2">{r.amountLabel}</td>
                      <td className="px-2 py-2">{r.paymentLabel}</td>
                      <td className="px-2 py-2">{r.applicationStatusLabel}</td>
                      <td className="px-2 py-2">{r.campaignStatusLabel}</td>
                      <td className="px-2 py-2">
                        <div>{r.runtimeExposureStatusLabel}</div>
                        {r.waitingReasonLabel ? (
                          <div className="mt-1 max-w-[180px] text-[11px] text-sam-muted">{r.waitingReasonLabel}</div>
                        ) : null}
                      </td>
                      <td className="relative px-2 py-2">
                        <button
                          type="button"
                          className="text-sam-brand underline"
                          data-shell-manage="1"
                          onClick={() => {
                            setManageOpenId(open ? null : r.id);
                            if (item) setSelected(item);
                          }}
                        >
                          {ko ? "관리 ▼" : "Manage ▼"}
                        </button>
                        {open && item ? (
                          <div
                            className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-ui-rect border border-sam-border bg-sam-surface p-2 shadow-md"
                            data-shell-manage-menu="1"
                          >
                            <Link
                              href={r.href}
                              className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                            >
                              {ko ? "상세" : "Detail"}
                            </Link>
                            {r.previewSupported ? (
                              <Link
                                href={r.previewHref}
                                className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                              >
                                {ko ? "미리보기" : "Preview"}
                              </Link>
                            ) : null}
                            {r.liveHref ? (
                              <a
                                href={r.liveHref}
                                target="_blank"
                                rel="noreferrer"
                                className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                              >
                                {ko ? "실제 노출 보기" : "View live"}
                              </a>
                            ) : null}
                            {actions.map((a) => (
                              <button
                                key={a}
                                type="button"
                                className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-sam-app"
                                disabled={busyAction != null}
                                onClick={() => void runDrawerAction(a, item)}
                              >
                                {ko ? ACTION_LABEL[a].ko : ACTION_LABEL[a].en}
                              </button>
                            ))}
                            {mode === "operations" && r.domain === "delivery" ? (
                              <Link
                                href="/admin/advertising/placements"
                                className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                              >
                                {ko ? "순서 변경" : "Reorder"}
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {mode === "operations" ? (
        <aside
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-shell-detail-panel="1"
        >
          {!selected || !selectedShell ? (
            <p className="text-[13px] text-sam-muted">
              {ko ? "목록에서 광고를 선택하세요." : "Select an ad from the list."}
            </p>
          ) : (
            <div className="space-y-3">
              {selectedShell.creativeImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator creative preview
                <img
                  src={selectedShell.creativeImageUrl}
                  alt=""
                  className="max-h-52 w-full rounded-ui-rect object-cover"
                />
              ) : null}
              <div>
                <h2 className="font-semibold text-sam-fg">{selectedShell.kindLabel}</h2>
                <p className="mt-0.5 text-sm font-medium text-sam-fg">{selectedShell.title}</p>
                <p className="text-[12px] text-sam-muted">{selectedShell.placementLabel}</p>
                <p className="mt-1 text-[13px]">{selectedShell.campaignStatusLabel}</p>
              </div>
              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "신청자" : "Applicant"}</dt>
                  <dd>{selectedShell.applicantLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "회원/매장" : "Member/Store"}</dt>
                  <dd>{selectedShell.memberOrStore}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "결제" : "Payment"}</dt>
                  <dd>{selectedShell.paymentLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "기간" : "Period"}</dt>
                  <dd>{selectedShell.periodLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "노출 위치" : "Placement"}</dt>
                  <dd>{selectedShell.placementLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "우선순위" : "Priority"}</dt>
                  <dd>{selectedShell.priority ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">CTA</dt>
                  <dd>{selectedShell.ctaLabel || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "이동 대상" : "Destination"}</dt>
                  <dd className="max-w-[210px] break-all text-right">
                    {selectedShell.destinationLabel || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "운영 상태" : "Operating"}</dt>
                  <dd>{selectedShell.operatingStatusLabel || selected.status}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "실제 노출 상태" : "Runtime"}</dt>
                  <dd>{selectedShell.runtimeExposureStatusLabel}</dd>
                </div>
              </dl>
              {selectedShell.missingFieldsLabel ? (
                <p className="rounded-ui-rect bg-sam-app px-3 py-2 text-[12px] text-sam-muted">
                  {ko ? "불완전" : "Incomplete"}
                  {" · "}
                  {selectedShell.missingFieldsLabel}
                </p>
              ) : null}
              {selectedShell.runtimeDisplayStatus === "eligible_waiting" ? (
                <p className="whitespace-pre-wrap rounded-ui-rect bg-sam-app px-3 py-2 text-[12px] text-sam-muted">
                  {selectedShell.waitingReasonLabel ||
                    (ko
                      ? "현재 같은 위치의 다른 팝업이 우선 노출되고 있습니다."
                      : "Another popup is currently prioritized on this surface.")}
                </p>
              ) : null}
              <p className="text-[11px] text-sam-muted">
                {ko
                  ? "우선순위: 같은 위치에 여러 광고가 있는 경우 표시 순서를 결정하는 운영 설정입니다."
                  : "Priority: operator override when multiple ads share a placement."}
              </p>

              {selectedActions.includes("change_period") ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] text-sam-muted">
                    {ko ? "시작" : "Start"}
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </label>
                  <label className="block text-[11px] text-sam-muted">
                    {ko ? "종료" : "End"}
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              <label className="block text-[11px] text-sam-muted">
                {ko ? "신청자 메시지 (반려·보류·연장)" : "Applicant-visible message"}
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                  rows={2}
                  value={publicMessage}
                  onChange={(e) => setPublicMessage(e.target.value)}
                />
              </label>
              {selectedActions.includes("extend_compensation") ? (
                <label className="block text-[11px] text-sam-muted">
                  {ko ? "연장 일수" : "Extend days"}
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="mt-1 w-24 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                    value={extendDays}
                    onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
              ) : null}
              <label className="block text-[11px] text-sam-muted">
                {ko ? "내부 메모" : "Internal memo"}
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                  rows={2}
                  value={internalMemo}
                  onChange={(e) => setInternalMemo(e.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {selectedActions.map((a) => (
                  <AdminActionButton
                    key={a}
                    type="button"
                    disabled={busyAction != null}
                    onClick={() => void runDrawerAction(a, selected)}
                    data-drawer-action={a}
                  >
                    {busyAction === a ? "…" : ko ? ACTION_LABEL[a].ko : ACTION_LABEL[a].en}
                  </AdminActionButton>
                ))}
              </div>

              <div className="flex flex-col gap-1 text-[13px]">
                {selectedShell.previewSupported ? (
                  <AdminActionLink href={selectedShell.previewHref}>
                    {ko ? "미리보기" : "Preview"}
                  </AdminActionLink>
                ) : null}
                <AdminActionLink href={selectedShell.href}>
                  {ko ? "수정 / 상세" : "Edit / detail"}
                </AdminActionLink>
                {selectedShell.liveHref ? (
                  <a
                    href={selectedShell.liveHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sam-brand underline"
                  >
                    {ko ? "실제 노출 보기" : "View live surface"}
                  </a>
                ) : (
                  <span className="text-sam-muted">
                    {ko ? "실제 노출 링크 없음" : "No live link"}
                  </span>
                )}
                {!selectedShell.previewSupported ? (
                  <span className="text-sam-muted">
                    {ko
                      ? "연결된 미리보기는 상세 화면에서 확인하세요."
                      : "Use detail screen for preview when available."}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </aside>
        ) : null}
      </div>

      <p className="text-[11px] text-sam-muted">
        <Link href="/admin/delivery-ads/commercial-settings" className="underline">
          {ko ? "광고 상품 / 가격" : "Products & pricing"}
        </Link>
        {" · "}
        <Link href="/admin/feed-ad-products" className="underline">
          {ko ? "피드 배너 가격" : "Feed banner pricing"}
        </Link>
      </p>
    </div>
  );
}
