"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

type ResultState = { ok: true; message: string } | { ok: false; code: string } | null;

type RiderSnap = {
  id: string;
  display_name?: string;
  is_online?: boolean;
  rider_status?: string;
  admin_status?: string;
  admin_note?: string | null;
  suspended_at?: string | null;
  last_active_at?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  in_progress_count?: number;
  completed_today?: number;
  avg_delivery_minutes_today?: number | null;
  failed_delivery_rows?: number;
  long_delivery_count?: number;
  active_orders?: { order_id: string; order_no?: string; delivery_status?: string; order_status?: string }[];
};

type UnassignedRow = {
  order_id: string;
  order_no?: string;
  order_status?: string;
  delivery_status?: string;
  updated_at?: string;
};

type DeliveryDetail = {
  order_id: string;
  rider_id?: string | null;
  delivery_status?: string;
  assigned_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  delivered_confirmed_at?: string | null;
  delivered_receiver_name?: string | null;
  delivered_proof_note?: string | null;
  delivered_proof_admin_view_url?: string | null;
  delivered_proof_admin_view_legacy_public?: boolean;
  delivered_proof_lat?: number | null;
  delivered_proof_lng?: number | null;
  rider_failure_reported_at?: string | null;
  rider_failure_report_reason?: string | null;
  failure_note?: string | null;
  failure_proof_admin_view_url?: string | null;
  failure_proof_admin_view_legacy_public?: boolean;
  failure_report_lat?: number | null;
  failure_report_lng?: number | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  admin_note?: string | null;
};

function errCode(status: number, j: unknown, fallback: string): string {
  const e = j != null && typeof j === "object" ? (j as { error?: unknown }).error : undefined;
  // 코드 형태(snake_case)만 사용 — DB 원문 메시지 등은 화면에 노출하지 않는다.
  if (typeof e === "string" && /^[a-z][a-z0-9_]*$/i.test(e.trim())) return e.trim();
  if (status === 403) return "forbidden";
  return fallback;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function AdminDeliveryRidersPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const dash = t("admin_del_common_dash");
  const deliveryStatusText = useCallback(
    (raw: string | null | undefined) => (raw ? adminStatusLabel("rider_delivery", raw, ko).label : dash),
    [ko, dash]
  );

  /** 시각 표시 = Asia/Manila */
  const fmtTs = useCallback(
    (v: string | null | undefined): string => (v ? formatAdminManilaDateTime(v) : dash),
    [dash]
  );

  const [tab, setTab] = useState<"riders" | "queue">("riders");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [memoDraft, setMemoDraft] = useState<Record<string, string>>({});
  const [riders, setRiders] = useState<RiderSnap[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const [allowOffline, setAllowOffline] = useState(false);
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [busyRider, setBusyRider] = useState<string | null>(null);

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reassignPick, setReassignPick] = useState("");

  const riderTableHeaders = useMemo(
    () =>
      [
        "admin_del_th_rider",
        "admin_del_th_status",
        "admin_del_th_in_progress",
        "admin_del_th_completed_today",
        "admin_del_th_avg_minutes",
        "admin_del_th_failed_rows",
        "admin_del_th_long_delivery",
        "admin_del_th_activity_location",
        "admin_del_th_manage",
      ] as const,
    []
  );

  const queueTableHeaders = useMemo(
    () =>
      [
        "admin_del_th_order_col",
        "admin_del_th_order_status",
        "admin_del_th_delivery_status",
        "admin_del_th_updated",
        "admin_del_th_assign",
      ] as const,
    []
  );

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/admin/delivery-riders", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setLoadErr({ code: errCode(r.status, j, "load_failed"), status: r.status });
          setRiders([]);
          setUnassigned([]);
          return;
        }
        setLoadErr(null);
        const rs = Array.isArray(j?.riders) ? j.riders : [];
        const uq = Array.isArray(j?.unassigned_deliveries) ? j.unassigned_deliveries : [];
        setRiders(rs.filter((x: unknown): x is RiderSnap => x != null && typeof x === "object" && "id" in (x as object)));
        setUnassigned(
          uq.filter((x: unknown): x is UnassignedRow => x != null && typeof x === "object" && "order_id" in (x as object))
        );
        setGeneratedAt(typeof j?.generated_at === "string" ? j.generated_at : null);
      })
      .catch(() => {
        setLoadErr({ code: "network_error" });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const assignableRiders = useMemo(
    () =>
      riders.filter((r) => {
        if (r.suspended_at) return false;
        if (r.admin_status === "paused") return false;
        return true;
      }),
    [riders]
  );

  const openDetail = useCallback((orderId: string) => {
    setDetailOrderId(orderId);
    setReassignPick("");
    setDetailLoading(true);
    setDetail(null);
    void fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/delivery`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.delivery) {
          setDetail(null);
          return;
        }
        setDetail(j.delivery as DeliveryDetail);
      })
      .finally(() => setDetailLoading(false));
  }, []);

  const patchDelivery = useCallback(
    async (orderId: string, body: Record<string, unknown>, successMsg?: string) => {
      setBusyOrder(orderId);
      setResult(null);
      try {
        const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/delivery`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setResult({ ok: false, code: errCode(r.status, j, "update_failed") });
          return;
        }
        setResult({ ok: true, message: successMsg ?? t("admin_r4d_done") });
        load();
        if (detailOrderId === orderId) openDetail(orderId);
      } catch {
        setResult({ ok: false, code: "network_error" });
      } finally {
        setBusyOrder(null);
      }
    },
    [detailOrderId, load, openDetail, t]
  );

  const patchRider = useCallback(
    async (riderId: string, body: Record<string, unknown>, successMsg?: string) => {
      setBusyRider(riderId);
      setResult(null);
      try {
        const r = await fetch(`/api/admin/delivery-riders/${encodeURIComponent(riderId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setResult({ ok: false, code: errCode(r.status, j, "update_failed") });
          // 다른 관리자가 먼저 바꿈 (409) → 최신 값을 다시 불러온다
          if (r.status === 409) load();
          return false;
        }
        setResult({ ok: true, message: successMsg ?? t("admin_r4d_rider_status_saved") });
        load();
        return true;
      } catch {
        setResult({ ok: false, code: "network_error" });
        return false;
      } finally {
        setBusyRider(null);
      }
    },
    [load, t]
  );

  const markAttention = useCallback(
    async (orderId: string) => {
      if (busyOrder) return;
      const c = await confirmAdminAction({
        level: adminActionLevel("hold"),
        ko,
        title: t("admin_r4d_attention_title"),
        confirmLabel: t("admin_del_btn_mark_attention"),
      });
      if (!c.ok) return;
      setBusyOrder(orderId);
      setResult(null);
      try {
        const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needs_admin_attention: true }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || j?.ok === false) {
          setResult({ ok: false, code: errCode(r.status, j, "update_failed") });
          return;
        }
        setResult({ ok: true, message: t("admin_r4d_attention_done") });
        load();
        if (detailOrderId === orderId) openDetail(orderId);
      } catch {
        setResult({ ok: false, code: "network_error" });
      } finally {
        setBusyOrder(null);
      }
    },
    [busyOrder, ko, t, load, detailOrderId, openDetail]
  );

  /** 실제 집계만 표시 (DEF-43 — 휴리스틱 % 제거). */
  const riderCounts = useMemo(
    () => ({
      suspended: riders.filter((r) => r.suspended_at).length,
      flagged: riders.filter((r) => r.admin_status === "flagged").length,
    }),
    [riders]
  );

  const riderName = useCallback(
    (riderId: string | null | undefined) => {
      if (!riderId) return dash;
      const hit = riders.find((r) => r.id === riderId);
      return hit?.display_name?.trim() || (ko ? "이름 없는 라이더" : "Unnamed rider");
    },
    [riders, dash, ko]
  );

  const offlineSuffix = t("admin_del_offline_suffix");

  return (
    <div className="sam-page-stack">
      <AdminPageHeader titleKey="admin_menu_delivery_riders_ops" descriptionKey="admin_del_riders_page_desc" />

      <div className="flex flex-wrap items-center gap-2 sam-text-xxs text-sam-muted">
        <Link href="/admin/delivery-operations" className="text-signature underline">
          {t("admin_menu_delivery_operations_stats")}
        </Link>
        <span>|</span>
        <span>
          {ko ? "정지 라이더" : "Suspended riders"} <strong className="text-sam-fg">{riderCounts.suspended}</strong>
          {" · "}
          {ko ? "주의 표시 라이더" : "Flagged riders"} <strong className="text-sam-fg">{riderCounts.flagged}</strong>
        </span>
        {generatedAt ? (
          <span className="font-mono text-[12px]">{t("admin_del_generated_at", { at: fmtTs(generatedAt) })}</span>
        ) : null}
        <AdminActionButton type="button" variant="secondary" size="sm" disabled={loading} onClick={() => load()}>
          {t("admin_del_common_refresh")}
        </AdminActionButton>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 sam-text-xxs text-sam-muted">
        <input type="checkbox" checked={allowOffline} onChange={(e) => setAllowOffline(e.target.checked)} />
        {t("admin_del_allow_offline_assign")}
      </label>

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {loading && riders.length === 0 && !loadErr ? <AdminLoadingState ko={ko} /> : null}
      {loadErr ? <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={() => load()} /> : null}

      <div className="flex flex-wrap gap-2">
        <AdminChipButton
          type="button"
          selected={tab === "riders"}
          onClick={() => setTab("riders")}
        >
          {t("admin_del_tab_riders", { count: riders.length })}
        </AdminChipButton>
        <AdminChipButton
          type="button"
          selected={tab === "queue"}
          onClick={() => setTab("queue")}
        >
          {t("admin_del_tab_unassigned", { count: unassigned.length })}
        </AdminChipButton>
      </div>

      {tab === "riders" ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-[1100px] w-full border-collapse sam-text-xxs">
            <thead>
              <tr className="border-b border-sam-border text-left text-sam-muted">
                {riderTableHeaders.map((key) => (
                  <th key={key} className="py-2 px-2">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.id} className="border-b border-sam-border/60 align-top">
                  <td className="py-2 px-2">
                    <div className="font-medium text-sam-fg">{r.display_name?.trim() || (ko ? "이름 없는 라이더" : "Unnamed rider")}</div>
                    <AdminTechDetails ko={ko}>{r.id}</AdminTechDetails>
                  </td>
                  <td className="py-2 px-2">
                    <div>{r.is_online ? t("admin_del_online") : t("admin_del_offline")}</div>
                    <div className="text-[12px] text-sam-muted">
                      {t("admin_del_admin_status_prefix", {
                        status: r.admin_status ? adminStatusLabel("rider_admin", r.admin_status, ko).label : dash,
                      })}
                    </div>
                    {r.suspended_at ? <div className="text-[12px] text-sam-warning">{t("admin_del_suspended")}</div> : null}
                  </td>
                  <td className="py-2 px-2 tabular-nums">{num(r.in_progress_count)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.completed_today)}</td>
                  <td className="py-2 px-2 tabular-nums">
                    {r.avg_delivery_minutes_today == null ? dash : String(r.avg_delivery_minutes_today)}
                  </td>
                  <td className="py-2 px-2 tabular-nums">{num(r.failed_delivery_rows)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.long_delivery_count)}</td>
                  <td className="py-2 px-2 text-[12px] text-sam-muted">
                    <div>{fmtTs(r.last_active_at ?? null)}</div>
                    {r.current_lat != null && r.current_lng != null ? (
                      <div className="font-mono">
                        {Number(r.current_lat).toFixed(4)}, {Number(r.current_lng).toFixed(4)}
                      </div>
                    ) : (
                      <div>{t("admin_del_no_location")}</div>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex flex-col gap-1">
                      <AdminActionButton
                        type="button"
                        disabled={busyRider === r.id}
                        variant="secondary" size="sm"
                        onClick={async () => {
                          if (busyRider) return;
                          const c = await confirmAdminAction({
                            level: adminActionLevel(r.is_online ? "disable" : "resume"),
                            ko,
                            title: r.is_online
                              ? ko
                                ? "이 라이더를 오프라인으로 바꿀까요?"
                                : "Set this rider offline?"
                              : ko
                                ? "이 라이더를 온라인으로 바꿀까요?"
                                : "Set this rider online?",
                            description: r.display_name ?? undefined,
                            confirmLabel: r.is_online ? t("admin_del_btn_go_offline") : t("admin_del_btn_go_online"),
                          });
                          if (!c.ok) return;
                          void patchRider(r.id, { is_online: !r.is_online });
                        }}
                      >
                        {r.is_online ? t("admin_del_btn_go_offline") : t("admin_del_btn_go_online")}
                      </AdminActionButton>
                      <AdminActionButton
                        type="button"
                        disabled={busyRider === r.id}
                        variant="secondary" size="sm"
                        onClick={async () => {
                          if (busyRider) return;
                          const c = await confirmAdminAction({
                            level: r.suspended_at ? "L1" : "L2",
                            ko,
                            title: r.suspended_at
                              ? ko
                                ? "이 라이더의 정지를 해제할까요?"
                                : "Resume this rider?"
                              : ko
                                ? "이 라이더를 정지할까요?"
                                : "Suspend this rider?",
                            description: r.suspended_at
                              ? (r.display_name ?? undefined)
                              : ko
                                ? `${r.display_name ?? ""} — 정지하면 새 배정을 받을 수 없습니다.`.trim()
                                : `${r.display_name ?? ""} — a suspended rider cannot receive new assignments.`.trim(),
                            confirmLabel: r.suspended_at ? t("admin_del_btn_resume") : t("admin_del_btn_suspend"),
                            destructive: !r.suspended_at,
                          });
                          if (!c.ok) return;
                          void patchRider(
                            r.id,
                            r.suspended_at ? { resume: true } : { suspend: true, reason: c.reason }
                          );
                        }}
                      >
                        {r.suspended_at ? t("admin_del_btn_resume") : t("admin_del_btn_suspend")}
                      </AdminActionButton>
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[12px] text-signature">{t("admin_del_memo_summary")}</summary>
                      {/* 명시적 저장 — 입력 이탈 시 자동 저장하지 않는다 */}
                      <textarea
                        className="sam-input mt-1 h-16 w-full text-[12px]"
                        value={memoDraft[r.id] ?? r.admin_note ?? ""}
                        disabled={busyRider === r.id}
                        onChange={(e) => setMemoDraft((m) => ({ ...m, [r.id]: e.target.value }))}
                      />
                      <AdminActionButton
                        type="button"
                        variant="secondary" size="sm" className="mt-1"
                        disabled={
                          busyRider === r.id ||
                          memoDraft[r.id] === undefined ||
                          (memoDraft[r.id] ?? "").trim() === (r.admin_note ?? "").trim()
                        }
                        onClick={async () => {
                          const ok = await patchRider(
                            r.id,
                            { admin_note: (memoDraft[r.id] ?? "").trim(), expected_admin_note: r.admin_note ?? "" },
                            t("admin_r4d_rider_memo_saved")
                          );
                          if (ok) setMemoDraft(({ [r.id]: _done, ...rest }) => (void _done, rest));
                        }}
                      >
                        {t("admin_r4d_rider_memo_save")}
                      </AdminActionButton>
                    </details>
                    <div className="mt-1 space-y-0.5 text-[12px]">
                      {(r.active_orders ?? []).slice(0, 4).map((o) => (
                        <div key={o.order_id}>
                          <AdminActionButton variant="ghost" size="sm" className="!px-0" onClick={() => openDetail(o.order_id)}>
                            {o.order_no || (ko ? "주문" : "Order")} · {deliveryStatusText(o.delivery_status)}
                          </AdminActionButton>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && riders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sam-muted">
                    {t("admin_del_empty_riders")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-[920px] w-full border-collapse sam-text-xxs">
            <thead>
              <tr className="border-b border-sam-border text-left text-sam-muted">
                {queueTableHeaders.map((key) => (
                  <th key={key} className="py-2 px-2">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unassigned.map((u) => (
                <tr key={u.order_id} className="border-b border-sam-border/60 align-top">
                  <td className="py-2 px-2">
                    <AdminActionButton variant="ghost" size="sm" className="!px-0" onClick={() => openDetail(u.order_id)}>
                      {u.order_no || (ko ? "주문 보기" : "View order")}
                    </AdminActionButton>
                  </td>
                  <td className="py-2 px-2">{u.order_status ? adminStatusLabel("store_order", u.order_status, ko).label : dash}</td>
                  <td className="py-2 px-2">{deliveryStatusText(u.delivery_status)}</td>
                  <td className="py-2 px-2 font-mono tabular-nums">{fmtTs(u.updated_at)}</td>
                  <td className="py-2 px-2">
                    <select
                      className="sam-input h-8 min-w-[140px] text-[12px]"
                      value={assignMap[u.order_id] ?? ""}
                      onChange={(e) => setAssignMap((m) => ({ ...m, [u.order_id]: e.target.value }))}
                    >
                      <option value="">{t("admin_del_select_rider")}</option>
                      {assignableRiders.map((rr) => (
                        <option key={rr.id} value={rr.id}>
                          {(rr.display_name ?? formatAdminShortId(rr.id)) + (rr.is_online ? "" : offlineSuffix)}
                        </option>
                      ))}
                    </select>
                    <AdminActionButton
                      type="button"
                      disabled={busyOrder === u.order_id || !(assignMap[u.order_id] ?? "").trim()}
                      variant="primary" size="sm" className="ml-1 mt-1"
                      onClick={async () => {
                        if (busyOrder) return;
                        const c = await confirmAdminAction({
                          level: adminActionLevel("save"),
                          ko,
                          title: t("admin_r4d_assign_title"),
                          description: `${u.order_no ?? ""} → ${riderName(assignMap[u.order_id])}`.trim(),
                          confirmLabel: t("admin_del_btn_assign"),
                        });
                        if (!c.ok) return;
                        void patchDelivery(
                          u.order_id,
                          { assign_rider_id: assignMap[u.order_id], allow_offline_assign: allowOffline },
                          t("admin_r4d_assign_done")
                        );
                      }}
                    >
                      {t("admin_del_btn_assign")}
                    </AdminActionButton>
                  </td>
                </tr>
              ))}
              {!loading && unassigned.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sam-muted">
                    {t("admin_del_empty_unassigned")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {detailOrderId ? (
        <DibayOverlayRoot
          open
          onClose={() => setDetailOrderId(null)}
          dismissible
          placement="center"
          zRole="dialog"
        >
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className={OverlayUi.title}>{t("admin_del_detail_title")}</h2>
              <DibayOverlayButton roleTone="secondary" className="!min-h-9 !flex-none !px-3" onClick={() => setDetailOrderId(null)}>
                {t("common_close")}
              </DibayOverlayButton>
            </div>
            <AdminTechDetails ko={ko}>{detailOrderId}</AdminTechDetails>
            {detailLoading ? (
              <p className="mt-4 text-sam-muted sam-text-xxs">{t("common_loading")}</p>
            ) : detail ? (
              <dl className="mt-3 space-y-2 sam-text-xxs">
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "배달 상태" : "Delivery status"}</dt>
                  <dd className="text-sam-fg">{deliveryStatusText(detail.delivery_status)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "라이더" : "Rider"}</dt>
                  <dd className="text-sam-fg">{riderName(detail.rider_id)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "배정 시각" : "Assigned at"}</dt>
                  <dd>{fmtTs(detail.assigned_at ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "픽업 시각" : "Picked up at"}</dt>
                  <dd>{fmtTs(detail.picked_up_at ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "배달 완료 시각" : "Delivered at"}</dt>
                  <dd>{fmtTs(detail.delivered_at ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "완료 확인 시각" : "Delivery confirmed at"}</dt>
                  <dd>{fmtTs(detail.delivered_confirmed_at ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_pod_receiver")}</dt>
                  <dd className="mt-1 text-sam-fg">{detail.delivered_receiver_name ?? dash}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_pod_note")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{detail.delivered_proof_note ?? dash}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_pod_location")}</dt>
                  <dd className="mt-1 font-mono text-[12px]">
                    {detail.delivered_proof_lat != null && detail.delivered_proof_lng != null
                      ? `${detail.delivered_proof_lat}, ${detail.delivered_proof_lng}`
                      : dash}
                  </dd>
                </div>
                {detail.delivered_proof_admin_view_url ? (
                  <div>
                    <dt className="text-sam-muted">{t("admin_del_pod_photo")}</dt>
                    <dd className="mt-2 space-y-1">
                      {detail.delivered_proof_admin_view_legacy_public ? (
                        <span className="inline-block rounded px-1.5 py-0.5 bg-sam-warning/15 text-sam-warning sam-text-xxs">
                          {t("admin_del_legacy_public_url")}
                        </span>
                      ) : (
                        <span className="sam-text-xxs text-sam-muted">{t("admin_del_signed_url_hint")}</span>
                      )}
                      <div>
                        <a
                          href={detail.delivered_proof_admin_view_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-signature underline sam-text-xxs"
                        >
                          {t("admin_del_open_new_tab")}
                        </a>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.delivered_proof_admin_view_url}
                        alt={t("admin_del_pod_alt")}
                        className="mt-2 max-h-40 w-auto rounded-ui-rect border border-sam-border object-contain"
                      />
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-sam-muted">{t("admin_del_rider_failure_reported_at")}</dt>
                  <dd className="mt-1">{fmtTs(detail.rider_failure_reported_at ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_rider_failure_reason")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{detail.rider_failure_report_reason ?? dash}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_failure_proof_note")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{detail.failure_note ?? dash}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_failure_proof_location")}</dt>
                  <dd className="mt-1 font-mono text-[12px]">
                    {detail.failure_report_lat != null && detail.failure_report_lng != null
                      ? `${detail.failure_report_lat}, ${detail.failure_report_lng}`
                      : dash}
                  </dd>
                </div>
                {detail.failure_proof_admin_view_url ? (
                  <div>
                    <dt className="text-sam-muted">{t("admin_del_failure_proof_photo")}</dt>
                    <dd className="mt-2 space-y-1">
                      {detail.failure_proof_admin_view_legacy_public ? (
                        <span className="inline-block rounded px-1.5 py-0.5 bg-sam-warning/15 text-sam-warning sam-text-xxs">
                          {t("admin_del_legacy_public_url")}
                        </span>
                      ) : (
                        <span className="sam-text-xxs text-sam-muted">{t("admin_del_signed_url_hint_short")}</span>
                      )}
                      <div>
                        <a
                          href={detail.failure_proof_admin_view_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-signature underline sam-text-xxs"
                        >
                          {t("admin_del_open_new_tab")}
                        </a>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.failure_proof_admin_view_url}
                        alt={t("admin_del_failure_proof_alt")}
                        className="mt-2 max-h-40 w-auto rounded-ui-rect border border-sam-border object-contain"
                      />
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{t("admin_del_failed_at_confirmed")}</dt>
                  <dd>{fmtTs(detail.failed_at ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_failure_reason")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sam-fg">{detail.failure_reason ?? dash}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_admin_note")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{detail.admin_note ?? dash}</dd>
                </div>
                {detail.rider_id || detail.delivery_status ? (
                  <AdminTechDetails ko={ko}>
                    {detail.rider_id ? <div>{detail.rider_id}</div> : null}
                    {detail.delivery_status ? <div>{`delivery_status: ${detail.delivery_status}`}</div> : null}
                  </AdminTechDetails>
                ) : null}
              </dl>
            ) : (
              <p className="mt-4 text-sam-warning sam-text-xxs">{t("admin_del_no_delivery_row")}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--overlay-border)] pt-3">
              <select
                className="sam-input h-8 flex-1 min-w-[160px] text-[12px]"
                value={reassignPick}
                disabled={!detail?.rider_id}
                onChange={(e) => setReassignPick(e.target.value)}
              >
                <option value="">{t("admin_del_select_reassign_rider")}</option>
                {assignableRiders.map((rr) => (
                  <option key={rr.id} value={rr.id}>
                    {rr.display_name ?? formatAdminShortId(rr.id)}
                  </option>
                ))}
              </select>
              <AdminActionButton
                type="button"
                variant="secondary" size="sm"
                disabled={!detailOrderId || busyOrder === detailOrderId || !reassignPick.trim()}
                onClick={async () => {
                  if (busyOrder) return;
                  const c = await confirmAdminAction({
                    level: adminActionLevel("sanction"),
                    ko,
                    title: t("admin_r4d_reassign_title", {
                      from: riderName(detail?.rider_id),
                      to: riderName(reassignPick.trim()),
                    }),
                    description: t("admin_r4d_reassign_desc"),
                    confirmLabel: t("admin_r4d_reassign_confirm"),
                  });
                  if (!c.ok) return;
                  void patchDelivery(
                    detailOrderId,
                    {
                      reassign_rider_id: reassignPick.trim(),
                      expected_rider_id: detail?.rider_id ?? null,
                      allow_offline_assign: allowOffline,
                      reason: c.reason,
                    },
                    t("admin_r4d_reassign_done")
                  );
                }}
              >
                {t("admin_del_btn_reassign")}
              </AdminActionButton>
              <AdminActionButton
                type="button"
                variant="secondary" size="sm"
                disabled={!detailOrderId || busyOrder === detailOrderId}
                onClick={async () => {
                  if (busyOrder) return;
                  const c = await confirmAdminAction({
                    level: adminActionLevel("disable"),
                    ko,
                    title: t("admin_r4d_release_title"),
                    description: t("admin_r4d_release_desc"),
                    confirmLabel: t("admin_del_btn_release_rider"),
                    destructive: true,
                  });
                  if (!c.ok) return;
                  void patchDelivery(detailOrderId, { release_delivery_assignment: true }, t("admin_r4d_release_done"));
                }}
              >
                {t("admin_del_btn_release_rider")}
              </AdminActionButton>
              <AdminActionButton
                type="button"
                variant="secondary" size="sm"
                disabled={!detailOrderId || busyOrder === detailOrderId}
                onClick={async () => {
                  if (busyOrder) return;
                  // L2 — 사유 필수, 사유가 실패 사유로 기록된다
                  const c = await confirmAdminAction({
                    level: adminActionLevel("reject"),
                    ko,
                    title: t("admin_r4d_mark_failed_title"),
                    description: t("admin_r4d_mark_failed_desc"),
                    confirmLabel: t("admin_del_btn_mark_failed"),
                    destructive: true,
                    reasonPlaceholder: t("admin_del_prompt_failure_reason"),
                  });
                  if (!c.ok) return;
                  void patchDelivery(
                    detailOrderId,
                    { set_delivery_status: "delivery_failed", failure_reason: c.reason, reason: c.reason },
                    t("admin_r4d_mark_failed_done")
                  );
                }}
              >
                {t("admin_del_btn_mark_failed")}
              </AdminActionButton>
              <AdminActionButton
                type="button"
                variant="secondary" size="sm"
                disabled={!detailOrderId || busyOrder === detailOrderId}
                onClick={() => void markAttention(detailOrderId)}
              >
                {t("admin_del_btn_mark_attention")}
              </AdminActionButton>
              <Link
                href={`/admin/stores/orders/${encodeURIComponent(detailOrderId)}`}
                className="sam-btn sam-btn--outline sam-btn--sm text-[12px]"
              >
                {ko ? "주문 상세" : "Order detail"}
              </Link>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}
    </div>
  );
}
