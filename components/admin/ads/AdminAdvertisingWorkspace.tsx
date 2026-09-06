"use client";

/**
 * One-page Domain Ads Operations Workspace (ADDENDUM §6).
 * Consumes existing control-plane loader — no new ads tables.
 * Mutations stay on writer routes via detail href (drawer next).
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
  listWorkspaceDrawerActions,
  parseWorkspaceEntityId,
  type WorkspaceDrawerAction,
} from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import { BANNER_PLACEMENT_CAPACITY_SSOT } from "@/lib/ads/banner-placement-capacity-ssot";
import { maskAdvertisingStatement, statementFromPointPromotionOrder } from "@/lib/ads/advertising-statement";

type StatusFilter = "all" | "pending" | "live" | "reserved" | "paused" | "ending";

const ACTION_LABEL: Record<WorkspaceDrawerAction, { ko: string; en: string }> = {
  approve: { ko: "승인", en: "Approve" },
  reject: { ko: "반려", en: "Reject" },
  request_changes: { ko: "수정 요청", en: "Request changes" },
  pause: { ko: "일시중지", en: "Pause" },
  resume: { ko: "재개", en: "Resume" },
  end: { ko: "종료", en: "End" },
  terminate: { ko: "강제 종료", en: "Terminate" },
  delete_safe_draft: { ko: "삭제", en: "Delete draft" },
  add_internal_memo: { ko: "내부 메모", en: "Internal memo" },
  extend_compensation: { ko: "보상 연장", en: "Comp. extend" },
};

export function AdminAdvertisingWorkspace() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<AdsControlPlaneModel | null>(null);
  const [err, setErr] = useState("");
  const [domain, setDomain] = useState<AdvertisingWorkspaceDomain>("delivery");
  const [product, setProduct] = useState<AdvertisingWorkspaceProductId>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<AdsActionItem | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [publicMessage, setPublicMessage] = useState("");
  const [internalMemo, setInternalMemo] = useState("");
  const [extendDays, setExtendDays] = useState(1);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/admin/ads-control-plane", { cache: "no-store" });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        plane?: AdsControlPlaneModel;
      } & Partial<AdsControlPlaneModel>;
      if (!res.ok || j.ok === false) {
        setErr(j.error ?? "load_failed");
        return;
      }
      // API contract: `{ ok: true, plane }` — same as AdminAdsExposureControlPlane.
      const plane = j.plane;
      if (!plane || !plane.queues || !Array.isArray(plane.occupancy)) {
        setErr(j.error ?? "load_failed");
        return;
      }
      setModel(plane);
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
    setInternalMemo("");
  }, [domain]);

  const runDrawerAction = useCallback(
    async (action: WorkspaceDrawerAction) => {
      if (!selected) return;
      const family = familyFromControlDomain(selected.domain, selected.product);
      if (!family) {
        setActionMsg(ko ? "이 행은 Drawer writer 미지원" : "No drawer writer for this row");
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
            family,
            entityId: parseWorkspaceEntityId(selected.id),
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
          setActionMsg(j.error ?? "action_failed");
          return;
        }
        setActionMsg(ko ? "처리되었습니다." : "Done.");
        setPublicMessage("");
        setInternalMemo("");
        await load();
      } catch {
        setActionMsg("action_failed");
      } finally {
        setBusyAction(null);
      }
    },
    [selected, publicMessage, internalMemo, extendDays, load, ko]
  );

  const chips =
    domain === "all"
      ? [{ id: "all" as const, labelKo: "전체 광고", labelEn: "All" }]
      : ADVERTISING_WORKSPACE_PRODUCTS_BY_DOMAIN[domain];

  const rows = useMemo(() => {
    if (!model) return [];
    const pool = [...model.actionRequired, ...model.applications, ...model.recent];
    const seen = new Set<string>();
    const uniq: AdsActionItem[] = [];
    for (const r of pool) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      uniq.push(r);
    }
    return uniq.filter((r) => {
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
      if (status === "all") return true;
      const st = `${r.status} ${r.exposureLabel ?? ""}`.toLowerCase();
      if (status === "pending") return st.includes("대기") || st.includes("검토") || st.includes("pending");
      if (status === "live") return st.includes("노출") && !st.includes("아직");
      if (status === "reserved") return st.includes("예약") || st.includes("scheduled");
      if (status === "paused") return st.includes("중지") || st.includes("pause");
      if (status === "ending") return (r.remainingLabel ?? "").includes("종료") || st.includes("종료");
      return true;
    });
  }, [model, domain, product, status]);

  const summary = useMemo(() => {
    const pending =
      (model?.queues?.delivery?.count ?? 0) +
      (model?.queues?.feed?.count ?? 0) +
      (model?.queues?.popup?.count ?? 0) +
      (model?.queues?.tradePromote?.count ?? 0) +
      (model?.queues?.communityPromote?.count ?? 0);
    const hero = model?.occupancy?.find((o) => o.placementKey === "STORES_HOME_HERO");
    return {
      pending,
      live: hero?.liveCount ?? model?.currentExecution?.length ?? 0,
      reserved: hero?.reservedCount ?? 0,
      vacant: hero?.vacant ?? 0,
      heroCapacity: hero?.capacity ?? BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.defaultCapacity,
    };
  }, [model]);

  const drawerFamily = selected
    ? familyFromControlDomain(selected.domain, selected.product)
    : null;
  const drawerActions = selected && drawerFamily
    ? listWorkspaceDrawerActions({
        family: drawerFamily,
        statusRaw: selected.status,
      })
    : [];

  const statementPreview = selected
    ? maskAdvertisingStatement(
        statementFromPointPromotionOrder({
          id: selected.id.replace(/^[^:]+:/, ""),
          domain:
            selected.domain === "community_promote"
              ? "community"
              : selected.domain === "trade_promote"
                ? "trade"
                : "trade",
          product_id: selected.product,
          placement: selected.placementHint,
          order_status: selected.status,
          point_cost: null,
          user_id: selected.memberId,
          target_title: selected.applicantLabel,
        }),
        "admin"
      )
    : null;

  return (
    <div className="space-y-4" data-admin-advertising-workspace="1">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-sam-fg">
          {ko ? "광고 / 홍보 관리" : "Ads / Promote"}
        </h1>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "신청부터 실제 노출까지 한 화면에서 관리합니다."
            : "Manage applications through live exposure on one screen."}
        </p>
      </header>

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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-workspace-summary="1">
        {(
          [
            ["pending", ko ? "승인 대기" : "Pending", summary.pending],
            ["live", ko ? "현재 노출" : "Live", summary.live],
            ["reserved", ko ? "예약" : "Reserved", summary.reserved],
            ["vacant", ko ? "빈 슬롯" : "Open slots", summary.vacant],
            ["hero", ko ? `홈 배너 수량 ${summary.heroCapacity}` : `Hero slots ${summary.heroCapacity}`, summary.heroCapacity],
          ] as const
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-left"
            onClick={() => {
              if (key === "pending") setStatus("pending");
              else if (key === "live") setStatus("live");
              else if (key === "reserved") setStatus("reserved");
              else setStatus("all");
            }}
          >
            <div className="sam-text-xxs text-sam-muted">{label}</div>
            <div className="text-lg font-semibold tabular-nums text-sam-fg">{value}</div>
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

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,340px)]">
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-sm" data-workspace-table="1">
            <thead className="bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "상품" : "Product"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "신청자" : "Applicant"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "위치" : "Placement"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "기간" : "Period"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "관리" : "Manage"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sam-muted">
                    {ko ? "표시할 광고가 없습니다." : "No ads in this filter."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-sam-border">
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.product}</td>
                    <td className="px-3 py-2">{r.applicantLabel}</td>
                    <td className="px-3 py-2">{r.placementHint ?? "—"}</td>
                    <td className="px-3 py-2">{r.periodLabel ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-sam-brand underline"
                        onClick={() => setSelected(r)}
                      >
                        {ko ? "검토" : "Review"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-workspace-drawer="1"
        >
          {!selected ? (
            <p className="sam-text-helper text-sam-muted">
              {ko ? "왼쪽에서 광고를 선택하세요." : "Select an ad from the list."}
            </p>
          ) : (
            <div className="space-y-2" data-workspace-drawer-live="1">
              <h2 className="font-semibold text-sam-fg">{selected.applicantLabel}</h2>
              <p className="sam-text-helper text-sam-muted">
                {selected.product} · {selected.placementHint}
              </p>
              <p className="sam-text-helper">{selected.whyActionable}</p>
              {statementPreview ? (
                <dl className="space-y-1 sam-text-helper">
                  <div>
                    <dt className="text-sam-muted">{ko ? "상태" : "Status"}</dt>
                    <dd>{statementPreview.currentStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">{ko ? "결제" : "Payment"}</dt>
                    <dd>{statementPreview.paymentStatus ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">{ko ? "금액" : "Amount"}</dt>
                    <dd>
                      {statementPreview.finalPrice ?? "—"} {statementPreview.currency}
                    </dd>
                  </div>
                </dl>
              ) : null}

              <label className="block sam-text-xxs text-sam-muted">
                {ko ? "신청자 메시지 (반려/수정요청/연장 사유)" : "Public message / extend reason"}
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                  rows={2}
                  value={publicMessage}
                  onChange={(e) => setPublicMessage(e.target.value)}
                  data-drawer-public-message="1"
                />
              </label>
              {drawerActions.includes("extend_compensation") ? (
                <label className="block sam-text-xxs text-sam-muted">
                  {ko ? "보상 연장 일수" : "Compensation days"}
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="mt-1 w-24 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                    value={extendDays}
                    onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value) || 1))}
                    data-drawer-extend-days="1"
                  />
                </label>
              ) : null}
              <label className="block sam-text-xxs text-sam-muted">
                {ko ? "내부 메모 (관리자만)" : "Internal memo"}
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                  rows={2}
                  value={internalMemo}
                  onChange={(e) => setInternalMemo(e.target.value)}
                  data-drawer-internal-memo="1"
                />
              </label>

              <div className="flex flex-wrap gap-2" data-drawer-actions="1">
                {drawerActions.map((a) => (
                  <AdminActionButton
                    key={a}
                    type="button"
                    disabled={busyAction != null}
                    onClick={() => void runDrawerAction(a)}
                    data-drawer-action={a}
                  >
                    {busyAction === a ? "…" : ko ? ACTION_LABEL[a].ko : ACTION_LABEL[a].en}
                  </AdminActionButton>
                ))}
              </div>
              {actionMsg ? (
                <p className="sam-text-xxs text-sam-muted" data-drawer-action-msg="1">
                  {actionMsg}
                </p>
              ) : null}
              <AdminActionLink href={selected.href}>
                {ko ? "기존 상세 화면" : "Legacy detail"}
              </AdminActionLink>
            </div>
          )}
        </aside>
      </div>

      <p className="sam-text-xxs text-sam-muted">
        <Link href="/admin/delivery-ads/commercial-settings" className="underline">
          {ko ? "상품 · 가격 설정" : "Products & pricing"}
        </Link>
        {" · "}
        <Link href="/admin/promoted-items" className="underline">
          {ko ? "광고 이력" : "Ad history"}
        </Link>
      </p>
    </div>
  );
}
