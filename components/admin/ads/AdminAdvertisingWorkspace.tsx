"use client";

/**
 * Canonical Admin Ads / Exposure home — /admin/advertising
 * FINAL LOCK: single entry · manage dropdown · placement board · capacity · feedback
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import type { AdsActionItem, AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";
import {
  ADVERTISING_WORKSPACE_PRODUCTS_BY_DOMAIN,
  type AdvertisingWorkspaceDomain,
  type AdvertisingWorkspaceProductId,
  rowMatchesWorkspaceFilter,
} from "@/lib/admin/advertising-workspace/product-chips";
import {
  familyFromControlDomain,
  type WorkspaceDrawerAction,
} from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import {
  DELIVERY_HERO_CAPACITY,
  DELIVERY_HERO_PLACEMENT_KEY,
} from "@/lib/admin/ads-exposure/capacity-gate";
import {
  humanPlacementLabel,
  productKindLabel,
} from "@/lib/admin/ads-exposure/human-placement-label";
import {
  adsOpsStatusLabel,
  projectAdsOpsStatus,
  type AdsOpsStatus,
} from "@/lib/admin/ads-exposure/ops-status";
import {
  ADS_FEEDBACK,
  feedbackApprovedWithStart,
} from "@/lib/admin/ads-exposure/action-feedback";
import {
  adsManageActionLabel,
  listAdsManageActions,
  type AdsManageAction,
} from "@/lib/admin/ads-exposure/manage-actions";
import { adsLiveRouteHref } from "@/lib/admin/ads-exposure/live-route";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

type StatusFilter =
  | "all"
  | "pending"
  | "scheduled"
  | "live"
  | "paused"
  | "ended"
  | "rejected"
  | "placement";

function rowOpsStatus(r: AdsActionItem): AdsOpsStatus {
  return projectAdsOpsStatus({ rawStatus: r.status, startAt: null, endAt: null });
}

function mapManageToWriter(action: AdsManageAction): WorkspaceDrawerAction | null {
  if (
    action === "approve" ||
    action === "reject" ||
    action === "request_changes" ||
    action === "pause" ||
    action === "resume" ||
    action === "end" ||
    action === "terminate" ||
    action === "delete_safe_draft" ||
    action === "add_internal_memo" ||
    action === "extend_compensation"
  ) {
    return action;
  }
  return null;
}

export function AdminAdvertisingWorkspace() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<AdsControlPlaneModel | null>(null);
  const [err, setErr] = useState("");
  const [domain, setDomain] = useState<AdvertisingWorkspaceDomain>("all");
  const [product, setProduct] = useState<AdvertisingWorkspaceProductId>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<AdsActionItem | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [publicMessage, setPublicMessage] = useState("");
  const [heroOrderIds, setHeroOrderIds] = useState<string[]>([]);
  const [orderMsg, setOrderMsg] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/admin/ads-control-plane", { cache: "no-store" });
      const j = (await res.json()) as AdsControlPlaneModel & { ok?: boolean; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "load_failed");
        return;
      }
      setModel(j);
      const heroOcc = j.occupancy?.find((o) => o.placementKey === DELIVERY_HERO_PLACEMENT_KEY);
      void heroOcc;
      const heroFromExec = (j.currentExecution ?? [])
        .filter(
          (e) =>
            e.domain === "delivery" &&
            (e.placement === DELIVERY_HERO_PLACEMENT_KEY ||
              String(e.product).includes("banner"))
        )
        .map((e) => e.id.replace(/^delivery_cam:/, ""));
      if (heroFromExec.length) setHeroOrderIds(heroFromExec);
    } catch {
      setErr("load_failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setProduct("all");
    setSelected(null);
    setActionMsg("");
    setPublicMessage("");
  }, [domain]);

  const runWriterAction = useCallback(
    async (row: AdsActionItem, action: WorkspaceDrawerAction) => {
      const family = familyFromControlDomain(row.domain, row.product);
      if (!family) {
        setActionMsg(ko ? "이 행은 관리 액션이 연결되지 않았습니다." : "No writer for this row.");
        return;
      }
      if (action === "end" && (family === "boost_trade" || family === "boost_community")) {
        if (!window.confirm(ko ? ADS_FEEDBACK.endBoostConfirm.ko : ADS_FEEDBACK.endBoostConfirm.en)) {
          return;
        }
      }
      if (action === "delete_safe_draft") {
        if (!window.confirm(ko ? ADS_FEEDBACK.deleteConfirm.ko : ADS_FEEDBACK.deleteConfirm.en)) {
          return;
        }
      }
      if (action === "reject" && !publicMessage.trim()) {
        setActionMsg(ko ? "반려 사유가 필요합니다." : "Rejection reason required.");
        return;
      }
      setBusyAction(`${row.id}:${action}`);
      setActionMsg("");
      try {
        const res = await fetch("/api/admin/advertising-workspace/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            family,
            entityId: row.id.includes(":") ? row.id.slice(row.id.indexOf(":") + 1) : row.id,
            action,
            reason: publicMessage || undefined,
            publicMessage: publicMessage || undefined,
            productKind: row.product.includes("sponsored") ? "store_sponsored" : "banner",
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          endAt?: string;
        };
        if (!res.ok || !j.ok) {
          setActionMsg(j.error ?? ADS_FEEDBACK.saveFailed.ko);
          return;
        }
        if (action === "approve") {
          setActionMsg(
            feedbackApprovedWithStart({
              startAt: null,
              placementKey: row.placementHint,
              ko,
            })
          );
        } else if (action === "reject") {
          setActionMsg(ko ? ADS_FEEDBACK.rejected.ko : ADS_FEEDBACK.rejected.en);
        } else if (action === "pause") {
          setActionMsg(ko ? ADS_FEEDBACK.paused.ko : ADS_FEEDBACK.paused.en);
        } else if (action === "resume") {
          setActionMsg(ko ? ADS_FEEDBACK.resumed.ko : ADS_FEEDBACK.resumed.en);
        } else if (action === "end" || action === "terminate") {
          setActionMsg(ko ? ADS_FEEDBACK.ended.ko : ADS_FEEDBACK.ended.en);
        } else if (action === "delete_safe_draft") {
          setActionMsg(ko ? ADS_FEEDBACK.deleted.ko : ADS_FEEDBACK.deleted.en);
        } else {
          setActionMsg(ko ? ADS_FEEDBACK.updated.ko : ADS_FEEDBACK.updated.en);
        }
        setPublicMessage("");
        setMenuOpenId(null);
        await load();
      } catch {
        setActionMsg(ADS_FEEDBACK.saveFailed.ko);
      } finally {
        setBusyAction(null);
      }
    },
    [ko, load, publicMessage]
  );

  const onManage = useCallback(
    async (row: AdsActionItem, action: AdsManageAction) => {
      if (action === "view_detail") {
        window.location.href = row.href;
        return;
      }
      if (action === "preview" || action === "edit" || action === "change_period") {
        window.location.href = row.href;
        return;
      }
      if (action === "view_live") {
        const href = adsLiveRouteHref({
          productKind: row.product,
          placementKey: row.placementHint,
          domain: row.domain,
        });
        if (href) window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      if (action === "view_history" || action === "view_reject_reason") {
        window.location.href = row.href;
        return;
      }
      if (action === "change_order") {
        setStatus("placement");
        setMenuOpenId(null);
        return;
      }
      if (action === "go_live_now") {
        await runWriterAction(row, "approve");
        return;
      }
      const writer = mapManageToWriter(action);
      if (writer) await runWriterAction(row, writer);
    },
    [runWriterAction]
  );

  const saveHeroOrder = useCallback(async () => {
    setOrderMsg("");
    setBusyAction("reorder");
    try {
      const res = await fetch("/api/admin/advertising/reorder-hero-banners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedCampaignIds: heroOrderIds }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setOrderMsg(j.error ?? ADS_FEEDBACK.saveFailed.ko);
        return;
      }
      setOrderMsg(j.message ?? ADS_FEEDBACK.orderSaved.ko);
      await load();
    } catch {
      setOrderMsg(ADS_FEEDBACK.saveFailed.ko);
    } finally {
      setBusyAction(null);
    }
  }, [heroOrderIds, load]);

  const chips =
    domain === "all"
      ? [{ id: "all" as const, labelKo: "전체 광고", labelEn: "All" }]
      : ADVERTISING_WORKSPACE_PRODUCTS_BY_DOMAIN[domain].filter(
          (c) =>
            c.id === "all" ||
            c.id === "boost" ||
            c.id === "feed_banner" ||
            c.id === "sponsored" ||
            c.id === "banner_hero" ||
            c.id === "popup"
        );

  const rows = useMemo(() => {
    if (!model) return [];
    const pool = [
      ...model.actionRequired,
      ...model.applications,
      ...model.recent,
      ...model.currentExecution.map((e) => ({
        id: e.id,
        domain: e.domain,
        product: e.product,
        entity: "execution" as const,
        applicantLabel: e.label,
        storeId: null,
        memberId: null,
        creativeHint: null,
        placementHint: e.placement,
        amountLabel: null,
        currency: e.currency,
        status: e.status,
        whyActionable: e.conflictSeverity !== "NONE" ? e.conflictLabelKo : null,
        paymentLabel: null,
        periodLabel: e.period,
        remainingLabel: e.remainingLabel,
        exposureLabel: e.eligibility,
        eligibility: e.eligibility,
        ageHours: null,
        at: new Date().toISOString(),
        source: e.source,
        href: e.href,
        statementHref: e.statementHref,
        financeHref: null,
        memberHref: null,
      })),
    ];
    const seen = new Set<string>();
    const uniq: AdsActionItem[] = [];
    for (const r of pool) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      uniq.push(r);
    }
    return uniq.filter((r) => {
      if (domain !== "all") {
        if (
          !rowMatchesWorkspaceFilter({
            domain: r.domain,
            product: r.product,
            placementHint: r.placementHint,
            workspaceDomain: domain,
            productId: product,
          })
        ) {
          return false;
        }
      }
      if (status === "all" || status === "placement") return true;
      const ops = rowOpsStatus(r);
      if (status === "pending") return ops === "pending";
      if (status === "scheduled") return ops === "scheduled";
      if (status === "live") return ops === "live";
      if (status === "paused") return ops === "paused";
      if (status === "ended") return ops === "ended" || ops === "archived";
      if (status === "rejected") return ops === "rejected";
      return true;
    });
  }, [model, domain, product, status]);

  const summary = useMemo(() => {
    const pending =
      (model?.queues.delivery.count ?? 0) +
      (model?.queues.feed.count ?? 0) +
      (model?.queues.popup.count ?? 0) +
      (model?.queues.tradePromote.count ?? 0) +
      (model?.queues.communityPromote.count ?? 0);
    const blocking = model?.queues.collisionBlocking.count ?? 0;
    const hero = model?.occupancy.find((o) => o.placementKey === DELIVERY_HERO_PLACEMENT_KEY);
    return {
      pending,
      live: model?.currentExecution.filter((e) => e.status.includes("노출")).length ?? 0,
      scheduled: model?.currentExecution.filter((e) => e.status.includes("예약")).length ?? 0,
      problems: blocking,
      heroLive: hero?.liveCount ?? 0,
      heroCapacity: hero?.capacity ?? DELIVERY_HERO_CAPACITY,
    };
  }, [model]);

  const moveHero = (index: number, dir: -1 | 1) => {
    setHeroOrderIds((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const t = next[index]!;
      next[index] = next[j]!;
      next[j] = t;
      return next;
    });
  };

  return (
    <div className="space-y-4" data-admin-advertising-workspace="1" data-admin-ads-exposure-home="1">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-sam-fg">
            {ko ? "광고 / 노출" : "Ads / Exposure"}
          </h1>
          <p className="sam-text-helper text-sam-muted">
            {ko
              ? "신청부터 실제 노출까지 한 곳에서 운영합니다."
              : "Operate applications through live exposure in one place."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminActionLink href="/admin/delivery-ads/first-party/new" variant="primary">
            {ko ? "+ 광고 등록" : "+ Create ad"}
          </AdminActionLink>
          <AdminActionLink href="/admin/platform-popup" variant="secondary">
            {ko ? "팝업 등록" : "Create popup"}
          </AdminActionLink>
          <AdminActionLink href="/admin/feed-ads/new" variant="secondary">
            {ko ? "피드 배너 등록" : "Feed banner"}
          </AdminActionLink>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-workspace-summary="1">
        {(
          [
            ["pending", ko ? "승인 대기" : "Pending", summary.pending],
            ["live", ko ? "노출 중" : "Live", summary.live],
            ["scheduled", ko ? "예약" : "Scheduled", summary.scheduled],
            ["problems", ko ? "문제" : "Issues", summary.problems],
          ] as const
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-left"
            onClick={() => {
              if (key === "pending") setStatus("pending");
              else if (key === "live") setStatus("live");
              else if (key === "scheduled") setStatus("scheduled");
              else setStatus("all");
            }}
          >
            <div className="sam-text-xxs text-sam-muted">{label}</div>
            <div className="text-lg font-semibold tabular-nums text-sam-fg">{value}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-workspace-domain-tabs="1">
        {(
          [
            ["all", ko ? "전체" : "All"],
            ["community", ko ? "커뮤니티" : "Community"],
            ["trade", ko ? "거래" : "Trade"],
            ["delivery", ko ? "배달" : "Delivery"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-ui-rect border px-3 py-1.5 text-sm ${
              domain === id
                ? "border-sam-brand bg-sam-brand/10 font-semibold text-sam-fg"
                : "border-sam-border bg-sam-surface text-sam-muted"
            }`}
            data-domain-tab={id}
            onClick={() => setDomain(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-workspace-status-tabs="1">
        {(
          [
            ["all", ko ? "전체" : "All"],
            ["pending", ko ? "승인 대기" : "Pending"],
            ["scheduled", ko ? "예약" : "Scheduled"],
            ["live", ko ? "노출 중" : "Live"],
            ["paused", ko ? "일시중지" : "Paused"],
            ["ended", ko ? "종료" : "Ended"],
            ["rejected", ko ? "반려" : "Rejected"],
            ["placement", ko ? "광고 위치 관리" : "Placements"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-ui-rect border px-2.5 py-1 text-sm ${
              status === id
                ? "border-sam-brand bg-sam-brand/10 font-semibold"
                : "border-sam-border bg-sam-app text-sam-muted"
            }`}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-workspace-product-chips="1">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`rounded-ui-rect border px-2.5 py-1 text-sm ${
              product === c.id
                ? "border-sam-brand bg-sam-brand/10 font-semibold"
                : "border-sam-border bg-sam-app text-sam-muted"
            }`}
            data-product-chip={c.id}
            onClick={() => setProduct(c.id)}
          >
            {ko ? c.labelKo : c.labelEn}
          </button>
        ))}
      </div>

      {err ? <p className="text-sm text-sam-danger">{err}</p> : null}
      {actionMsg ? (
        <p className="sam-text-helper text-sam-fg" data-drawer-action-msg="1">
          {actionMsg}
        </p>
      ) : null}

      {status === "placement" ? (
        <section
          className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-ads-placement-board="1"
        >
          <h2 className="font-semibold text-sam-fg">
            {humanPlacementLabel(DELIVERY_HERO_PLACEMENT_KEY, ko)}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {ko
              ? `현재 ${summary.heroLive} / ${summary.heroCapacity} · 자동 전환 5초 · 화면 1장`
              : `${summary.heroLive} / ${summary.heroCapacity} · auto 5s · 1 visible`}
          </p>
          <ol className="space-y-2">
            {heroOrderIds.map((id, idx) => (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
              >
                <span className="text-sm text-sam-fg">
                  Slide {idx + 1} · {id.slice(0, 8)}
                </span>
                <div className="flex gap-1">
                  <AdminActionButton
                    type="button"
                    variant="secondary"
                    disabled={idx === 0}
                    onClick={() => moveHero(idx, -1)}
                  >
                    ↑
                  </AdminActionButton>
                  <AdminActionButton
                    type="button"
                    variant="secondary"
                    disabled={idx >= heroOrderIds.length - 1}
                    onClick={() => moveHero(idx, 1)}
                  >
                    ↓
                  </AdminActionButton>
                  <AdminActionLink href={DELIVERY_AD_ADMIN_ROUTES.detail(id)}>
                    {ko ? "상세" : "Detail"}
                  </AdminActionLink>
                </div>
              </li>
            ))}
          </ol>
          {heroOrderIds.length === 0 ? (
            <p className="sam-text-helper text-sam-muted">
              {ko ? "현재 HERO 배너가 없습니다." : "No HERO banners."}
            </p>
          ) : (
            <AdminActionButton
              type="button"
              disabled={busyAction === "reorder"}
              onClick={() => void saveHeroOrder()}
            >
              {ko ? "배너 순서 저장" : "Save banner order"}
            </AdminActionButton>
          )}
          {orderMsg ? <p className="sam-text-helper text-sam-fg">{orderMsg}</p> : null}

          <h2 className="mt-6 font-semibold text-sam-fg">{ko ? "팝업" : "Popup"}</h2>
          <p className="sam-text-helper text-sam-muted">
            {ko
              ? `동일 대상 동시 노출 1개 · 우선순위 높은 캠페인 승리 · 활성 ${
                  model?.applications.filter((a) => a.domain === "popup" && a.id.startsWith("popup_cam:")).length ?? 0
                }건`
              : `Winner = 1 per target (priority DESC) · active ${
                  model?.applications.filter((a) => a.domain === "popup" && a.id.startsWith("popup_cam:")).length ?? 0
                }`}
          </p>
          <ul className="space-y-2">
            {(model?.applications ?? [])
              .filter((a) => a.domain === "popup" && a.id.startsWith("popup_cam:"))
              .slice(0, 8)
              .map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
                >
                  <span className="text-sm text-sam-fg">
                    {a.applicantLabel} · {a.exposureLabel ?? "—"} · {a.periodLabel ?? "—"}
                  </span>
                  <AdminActionLink href={a.href}>{ko ? "상세" : "Detail"}</AdminActionLink>
                </li>
              ))}
          </ul>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-sm" data-workspace-table="1">
            <thead className="bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "종류" : "Type"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "신청자" : "Applicant"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "위치" : "Placement"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "기간" : "Period"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "결제" : "Pay"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "관리" : "Manage"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sam-muted">
                    {ko ? "표시할 광고가 없습니다." : "No ads in this filter."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const ops = rowOpsStatus(r);
                  const family = familyFromControlDomain(r.domain, r.product) ?? "feed_banner";
                  const actions = listAdsManageActions({ status: ops, family });
                  return (
                    <tr key={r.id} className="border-t border-sam-border align-top">
                      <td className="px-3 py-2">{adsOpsStatusLabel(ops, ko)}</td>
                      <td className="px-3 py-2">{productKindLabel(r.product, ko)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left text-sam-brand underline"
                          onClick={() => setSelected(r)}
                        >
                          {r.applicantLabel}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {humanPlacementLabel(r.placementHint, ko)}
                      </td>
                      <td className="px-3 py-2">{r.periodLabel ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.paymentLabel ?? r.currency}
                        {r.amountLabel ? ` · ${r.amountLabel}` : ""}
                      </td>
                      <td className="relative px-3 py-2">
                        <button
                          type="button"
                          className="rounded-ui-rect border border-sam-border px-2 py-1 text-sm"
                          onClick={() =>
                            setMenuOpenId((cur) => (cur === r.id ? null : r.id))
                          }
                        >
                          {ko ? "관리 ▼" : "Manage ▼"}
                        </button>
                        {menuOpenId === r.id ? (
                          <div className="absolute right-2 z-20 mt-1 min-w-[10rem] rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-md">
                            {actions.map((a) => (
                              <button
                                key={a}
                                type="button"
                                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-sam-app"
                                disabled={busyAction != null}
                                onClick={() => void onManage(r, a)}
                              >
                                {adsManageActionLabel(a, ko)}
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
      )}

      {selected ? (
        <aside
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-workspace-drawer="1"
          data-workspace-drawer-live="1"
        >
          <h2 className="font-semibold text-sam-fg">{selected.applicantLabel}</h2>
          <p className="sam-text-helper text-sam-muted">
            {productKindLabel(selected.product, ko)} ·{" "}
            {humanPlacementLabel(selected.placementHint, ko)}
          </p>
          <p className="sam-text-helper">{selected.whyActionable}</p>
          <label className="mt-2 block sam-text-xxs text-sam-muted">
            {ko ? "반려 사유 / 공개 메시지" : "Reject reason / public message"}
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
              rows={2}
              value={publicMessage}
              onChange={(e) => setPublicMessage(e.target.value)}
              data-drawer-public-message="1"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2" data-drawer-actions="1">
            <AdminActionLink href={selected.href} variant="primary">
              {ko ? "상세보기" : "Details"}
            </AdminActionLink>
            {(() => {
              const live = adsLiveRouteHref({
                productKind: selected.product,
                placementKey: selected.placementHint,
                domain: selected.domain,
              });
              return live ? (
                <AdminActionLink href={live} variant="secondary">
                  {ko ? "실제 노출 보기" : "View live"}
                </AdminActionLink>
              ) : null;
            })()}
          </div>
        </aside>
      ) : null}

      <p className="sam-text-xxs text-sam-muted">
        <Link href="/admin/delivery-ads/commercial-settings" className="underline">
          {ko ? "상품 · 가격 설정" : "Products & pricing"}
        </Link>
        {" · "}
        <Link href="/admin/feed-ad-products" className="underline">
          {ko ? "피드 배너 가격" : "Feed banner prices"}
        </Link>
        {" · "}
        <Link href={DELIVERY_AD_ADMIN_ROUTES.hub} className="underline">
          {ko ? "배달 상세 허브" : "Delivery hub"}
        </Link>
      </p>
    </div>
  );
}
