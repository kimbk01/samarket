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

const STATUS_TABS: Array<{ id: AdsShellStatusTab; ko: string; en: string }> = [
  { id: "all", ko: "전체", en: "All" },
  { id: "pending", ko: "승인 대기", en: "Pending" },
  { id: "scheduled", ko: "예약", en: "Scheduled" },
  { id: "live", ko: "노출 중", en: "Live" },
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
  request_changes: { ko: "수정 요청", en: "Request changes" },
  pause: { ko: "일시중지", en: "Pause" },
  resume: { ko: "다시 노출", en: "Resume" },
  end: { ko: "종료", en: "End" },
  terminate: { ko: "강제 종료", en: "Terminate" },
  delete_safe_draft: { ko: "삭제", en: "Delete draft" },
  add_internal_memo: { ko: "내부 메모", en: "Internal memo" },
  extend_compensation: { ko: "기간 연장", en: "Extend period" },
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
  return ko ? ADS_FEEDBACK.updated.ko : ADS_FEEDBACK.updated.en;
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

export function AdminAdvertisingWorkspace() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<AdsControlPlaneModel | null>(null);
  const [err, setErr] = useState("");
  const [statusTab, setStatusTab] = useState<AdsShellStatusTab>("all");
  const [family, setFamily] = useState<AdsShellProductFamily>("all");
  const [selected, setSelected] = useState<AdsActionItem | null>(null);
  const [manageOpenId, setManageOpenId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [publicMessage, setPublicMessage] = useState("");
  const [internalMemo, setInternalMemo] = useState("");
  const [extendDays, setExtendDays] = useState(1);

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
    rows = filterShellRowsByProductFamily(rows, family);
    rows = filterShellRowsByTab(rows, statusTab);
    return rows;
  }, [model, ko, family, statusTab]);

  const itemById = useMemo(() => {
    const map = new Map<string, AdsActionItem>();
    if (!model) return map;
    for (const i of collectPool(model)) map.set(i.id, i);
    return map;
  }, [model]);

  const summary = useMemo(() => {
    if (!model) {
      return { pending: 0, live: 0, scheduled: 0, vacant: 0, heroCap: 5 };
    }
    const all = collectPool(model).map((i) => toAdsShellListRow(i, ko));
    const hero = model.occupancy?.find((o) => o.placementKey === "STORES_HOME_HERO");
    return {
      pending: all.filter((r) => r.statusTab === "pending").length,
      live: all.filter((r) => r.statusTab === "live").length,
      scheduled: all.filter((r) => r.statusTab === "scheduled").length,
      vacant: hero?.vacant ?? 0,
      heroCap:
        hero?.capacity ?? BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.defaultCapacity,
    };
  }, [model, ko]);

  const runDrawerAction = useCallback(
    async (action: WorkspaceDrawerAction, rowItem: AdsActionItem) => {
      const fam = familyFromControlDomain(rowItem.domain, rowItem.product);
      if (!fam) {
        setActionMsg(ko ? "이 행은 관리 액션이 없습니다." : "No manage actions for this row.");
        return;
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
    [publicMessage, internalMemo, extendDays, load, ko]
  );

  const selectedFamily = selected
    ? familyFromControlDomain(selected.domain, selected.product)
    : null;
  const selectedActions =
    selected && selectedFamily
      ? listWorkspaceDrawerActions({
          family: selectedFamily,
          statusRaw: selected.status,
        })
      : [];
  const selectedShell = selected ? toAdsShellListRow(selected, ko) : null;

  return (
    <div className="space-y-4" data-admin-advertising-shell="1" data-admin-advertising-workspace="1">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-sam-fg">
            {ko ? "광고 / 노출" : "Ads / Exposure"}
          </h1>
          <p className="text-[13px] text-sam-muted">
            {ko
              ? "신청 · 승인 · 실제 노출을 한곳에서 운영합니다. 기존 상세 화면으로 이동합니다."
              : "Operate applications through live exposure. Opens existing product details."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/advertising/direct"
            className={Sam.btn.primary}
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-shell-summary="1">
        {(
          [
            ["pending", ko ? "승인 대기" : "Pending", summary.pending],
            ["live", ko ? "노출 중" : "Live", summary.live],
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
              if (key === "pending" || key === "live" || key === "scheduled") {
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

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-[12px]" data-shell-table="1">
            <thead className="bg-sam-app text-sam-muted">
              <tr>
                <th className="px-2 py-2 font-medium">{ko ? "종류" : "Kind"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "신청자" : "Applicant"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "회원/매장" : "Member/Store"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "광고 대상" : "Target"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "노출 위치" : "Placement"}</th>
                <th className="px-2 py-2 font-medium">Slide</th>
                <th className="px-2 py-2 font-medium">{ko ? "기간" : "Period"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "금액" : "Amount"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "결제" : "Pay"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "관리" : "Manage"}</th>
              </tr>
            </thead>
            <tbody>
              {shellRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sam-muted">
                    {ko ? "표시할 광고가 없습니다." : "No ads in this filter."}
                  </td>
                </tr>
              ) : (
                shellRows.map((r) => {
                  const item = itemById.get(r.id);
                  const fam = item
                    ? familyFromControlDomain(item.domain, item.product)
                    : null;
                  const actions =
                    item && fam
                      ? listWorkspaceDrawerActions({
                          family: fam,
                          statusRaw: item.status,
                        })
                      : [];
                  const open = manageOpenId === r.id;
                  return (
                    <tr key={r.id} className="border-t border-sam-border align-top">
                      <td className="px-2 py-2 font-medium text-sam-fg">{r.kindLabel}</td>
                      <td className="px-2 py-2">{r.applicantLabel}</td>
                      <td className="px-2 py-2">{r.memberOrStore}</td>
                      <td className="px-2 py-2 max-w-[140px] truncate">{r.targetLabel}</td>
                      <td className="px-2 py-2">{r.placementLabel}</td>
                      <td className="px-2 py-2">{r.slideLabel ? r.slideLabel.split(">").pop()?.trim() : "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{r.periodLabel}</td>
                      <td className="px-2 py-2">{r.amountLabel}</td>
                      <td className="px-2 py-2">{r.paymentLabel}</td>
                      <td className="px-2 py-2">{r.statusLabel}</td>
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
                                href={r.href}
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
              <div>
                <h2 className="font-semibold text-sam-fg">{selectedShell.kindLabel}</h2>
                <p className="text-[12px] text-sam-muted">{selectedShell.placementLabel}</p>
                <p className="mt-1 text-[13px]">{selectedShell.statusLabel}</p>
              </div>
              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "신청자" : "Applicant"}</dt>
                  <dd>{selectedShell.applicantLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "기간" : "Period"}</dt>
                  <dd>{selectedShell.periodLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "금액" : "Amount"}</dt>
                  <dd>{selectedShell.amountLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "결제" : "Payment"}</dt>
                  <dd>{selectedShell.paymentLabel}</dd>
                </div>
              </dl>

              <label className="block text-[11px] text-sam-muted">
                {ko ? "신청자 메시지 (반려·수정요청·연장)" : "Applicant-visible message"}
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
                <AdminActionLink href={selectedShell.href}>
                  {ko ? "상세 화면 열기" : "Open detail"}
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
