"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

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

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function AdminDeliveryRidersPage() {
  const { t } = useI18n();
  const dash = t("admin_del_common_dash");

  const fmtTs = useCallback(
    (v: string | null | undefined): string => {
      if (!v) return dash;
      return v.slice(0, 19).replace("T", " ");
    },
    [dash]
  );

  const [tab, setTab] = useState<"riders" | "queue">("riders");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          setError(
            r.status === 503 ? t("admin_del_err_rpc_not_deployed") : t("admin_del_err_load_status", { status: r.status })
          );
          setRiders([]);
          setUnassigned([]);
          return;
        }
        setError(null);
        const rs = Array.isArray(j?.riders) ? j.riders : [];
        const uq = Array.isArray(j?.unassigned_deliveries) ? j.unassigned_deliveries : [];
        setRiders(rs.filter((x: unknown): x is RiderSnap => x != null && typeof x === "object" && "id" in (x as object)));
        setUnassigned(
          uq.filter((x: unknown): x is UnassignedRow => x != null && typeof x === "object" && "order_id" in (x as object))
        );
        setGeneratedAt(typeof j?.generated_at === "string" ? j.generated_at : null);
      })
      .catch(() => {
        setError(t("common_network_error"));
      })
      .finally(() => setLoading(false));
  }, [t]);

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
    async (orderId: string, body: Record<string, unknown>) => {
      setBusyOrder(orderId);
      try {
        const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/delivery`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setError(j?.error ? String(j.error) : t("admin_del_err_delivery_patch", { status: r.status }));
          return;
        }
        setError(null);
        load();
        if (detailOrderId === orderId) openDetail(orderId);
      } finally {
        setBusyOrder(null);
      }
    },
    [detailOrderId, load, openDetail, t]
  );

  const patchRider = useCallback(
    async (riderId: string, body: Record<string, unknown>) => {
      setBusyRider(riderId);
      try {
        const r = await fetch(`/api/admin/delivery-riders/${encodeURIComponent(riderId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setError(j?.error ? String(j.error) : t("admin_del_err_rider_patch", { status: r.status }));
          return;
        }
        setError(null);
        load();
      } finally {
        setBusyRider(null);
      }
    },
    [load, t]
  );

  const markAttention = useCallback(
    async (orderId: string) => {
      setBusyOrder(orderId);
      try {
        const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needs_admin_attention: true }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setError(j?.error ? String(j.error) : t("admin_del_err_order_patch", { status: r.status }));
          return;
        }
        setError(null);
      } finally {
        setBusyOrder(null);
      }
    },
    [t]
  );

  const stabPct = useMemo(() => {
    const suspended = riders.filter((r) => r.suspended_at).length;
    const flagged = riders.filter((r) => r.admin_status === "flagged").length;
    let s = 92;
    if (suspended > 0) s -= Math.min(25, suspended * 4);
    if (flagged > 0) s -= Math.min(15, flagged * 3);
    return Math.max(55, Math.min(98, s));
  }, [riders]);

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
          {t("admin_del_stability_heuristic")}{" "}
          <strong className="text-sam-fg">{stabPct}%</strong>
        </span>
        {generatedAt ? (
          <span className="font-mono text-[10px]">{t("admin_del_generated_at", { at: fmtTs(generatedAt) })}</span>
        ) : null}
        <button type="button" className="sam-btn sam-btn--outline sam-btn--sm" disabled={loading} onClick={() => load()}>
          {t("admin_del_common_refresh")}
        </button>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 sam-text-xxs text-sam-muted">
        <input type="checkbox" checked={allowOffline} onChange={(e) => setAllowOffline(e.target.checked)} />
        {t("admin_del_allow_offline_assign")}
      </label>

      {error ? (
        <div className="rounded-ui-rect border border-sam-warning/20 bg-sam-warning-soft px-3 py-2 sam-text-xxs text-sam-warning">
          {error}
          <button type="button" className="sam-btn sam-btn--outline sam-btn--sm ml-2" onClick={() => setError(null)}>
            {t("common_close")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${tab === "riders" ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setTab("riders")}
        >
          {t("admin_del_tab_riders", { count: riders.length })}
        </button>
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${tab === "queue" ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setTab("queue")}
        >
          {t("admin_del_tab_unassigned", { count: unassigned.length })}
        </button>
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
                    <div className="font-medium text-sam-fg">{r.display_name ?? r.id.slice(0, 8)}</div>
                    <div className="font-mono text-[10px] text-sam-muted">{r.id.slice(0, 8)}…</div>
                  </td>
                  <td className="py-2 px-2">
                    <div>{r.is_online ? t("admin_del_online") : t("admin_del_offline")}</div>
                    <div className="text-[10px] text-sam-muted">
                      {t("admin_del_admin_status_prefix", { status: r.admin_status ?? dash })}
                    </div>
                    {r.suspended_at ? <div className="text-[10px] text-sam-warning">{t("admin_del_suspended")}</div> : null}
                  </td>
                  <td className="py-2 px-2 tabular-nums">{num(r.in_progress_count)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.completed_today)}</td>
                  <td className="py-2 px-2 tabular-nums">
                    {r.avg_delivery_minutes_today == null ? dash : String(r.avg_delivery_minutes_today)}
                  </td>
                  <td className="py-2 px-2 tabular-nums">{num(r.failed_delivery_rows)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.long_delivery_count)}</td>
                  <td className="py-2 px-2 text-[10px] text-sam-muted">
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
                      <button
                        type="button"
                        disabled={busyRider === r.id}
                        className="sam-btn sam-btn--outline sam-btn--sm px-2 py-0.5 text-[11px]"
                        onClick={() => patchRider(r.id, { is_online: !r.is_online })}
                      >
                        {r.is_online ? t("admin_del_btn_go_offline") : t("admin_del_btn_go_online")}
                      </button>
                      <button
                        type="button"
                        disabled={busyRider === r.id}
                        className="sam-btn sam-btn--outline sam-btn--sm px-2 py-0.5 text-[11px]"
                        onClick={() => patchRider(r.id, r.suspended_at ? { resume: true } : { suspend: true })}
                      >
                        {r.suspended_at ? t("admin_del_btn_resume") : t("admin_del_btn_suspend")}
                      </button>
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] text-signature">{t("admin_del_memo_summary")}</summary>
                      <textarea
                        className="sam-input mt-1 h-16 w-full text-[11px]"
                        defaultValue={r.admin_note ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v === (r.admin_note ?? "").trim()) return;
                          void patchRider(r.id, { admin_note: v });
                        }}
                      />
                    </details>
                    <div className="mt-1 space-y-0.5 text-[10px]">
                      {(r.active_orders ?? []).slice(0, 4).map((o) => (
                        <div key={o.order_id}>
                          <button type="button" className="text-signature underline" onClick={() => openDetail(o.order_id)}>
                            {o.order_no || o.order_id.slice(0, 8)} · {o.delivery_status}
                          </button>
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
                    <button type="button" className="font-medium text-signature underline" onClick={() => openDetail(u.order_id)}>
                      {u.order_no || u.order_id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="py-2 px-2">{u.order_status ?? dash}</td>
                  <td className="py-2 px-2">{u.delivery_status ?? dash}</td>
                  <td className="py-2 px-2 font-mono tabular-nums">{fmtTs(u.updated_at)}</td>
                  <td className="py-2 px-2">
                    <select
                      className="sam-input h-8 min-w-[140px] text-[11px]"
                      value={assignMap[u.order_id] ?? ""}
                      onChange={(e) => setAssignMap((m) => ({ ...m, [u.order_id]: e.target.value }))}
                    >
                      <option value="">{t("admin_del_select_rider")}</option>
                      {assignableRiders.map((rr) => (
                        <option key={rr.id} value={rr.id}>
                          {(rr.display_name ?? rr.id.slice(0, 8)) + (rr.is_online ? "" : offlineSuffix)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busyOrder === u.order_id || !(assignMap[u.order_id] ?? "").trim()}
                      className="sam-btn sam-btn--primary sam-btn--sm ml-1 mt-1 text-[11px]"
                      onClick={() =>
                        void patchDelivery(u.order_id, {
                          assign_rider_id: assignMap[u.order_id],
                          allow_offline_assign: allowOffline,
                        })
                      }
                    >
                      {t("admin_del_btn_assign")}
                    </button>
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
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <h2 className="sam-text-body font-medium text-sam-fg">{t("admin_del_detail_title")}</h2>
              <button type="button" className="sam-btn sam-btn--outline sam-btn--sm" onClick={() => setDetailOrderId(null)}>
                {t("common_close")}
              </button>
            </div>
            <p className="mt-2 font-mono text-[11px] text-sam-muted">{detailOrderId}</p>
            {detailLoading ? (
              <p className="mt-4 text-sam-muted sam-text-xxs">{t("common_loading")}</p>
            ) : detail ? (
              <dl className="mt-3 space-y-2 sam-text-xxs">
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">delivery_status</dt>
                  <dd className="text-sam-fg">{detail.delivery_status}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">rider_id</dt>
                  <dd className="font-mono text-sam-fg">{detail.rider_id ?? dash}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">assigned_at</dt>
                  <dd>{fmtTs(detail.assigned_at ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">picked_up_at</dt>
                  <dd>{fmtTs(detail.picked_up_at ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">delivered_at</dt>
                  <dd>{fmtTs(detail.delivered_at ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">delivered_confirmed_at</dt>
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
                  <dd className="mt-1 font-mono text-[10px]">
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
                        <span className="inline-block rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-900 sam-text-xxs">
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
                  <dd className="mt-1 font-mono text-[10px]">
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
                        <span className="inline-block rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-900 sam-text-xxs">
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
                  <dd className="mt-1 text-sam-fg">{detail.failure_reason ?? dash}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{t("admin_del_admin_note")}</dt>
                  <dd className="mt-1">{detail.admin_note ?? dash}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sam-warning sam-text-xxs">{t("admin_del_no_delivery_row")}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-sam-border pt-3">
              <select
                className="sam-input h-8 flex-1 min-w-[160px] text-[11px]"
                value={reassignPick}
                disabled={!detail?.rider_id}
                onChange={(e) => setReassignPick(e.target.value)}
              >
                <option value="">{t("admin_del_select_reassign_rider")}</option>
                {assignableRiders.map((rr) => (
                  <option key={rr.id} value={rr.id}>
                    {rr.display_name ?? rr.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="sam-btn sam-btn--outline sam-btn--sm text-[11px]"
                disabled={!detailOrderId || busyOrder === detailOrderId || !reassignPick.trim()}
                onClick={() =>
                  void patchDelivery(detailOrderId, {
                    reassign_rider_id: reassignPick.trim(),
                    allow_offline_assign: allowOffline,
                  })
                }
              >
                {t("admin_del_btn_reassign")}
              </button>
              <button
                type="button"
                className="sam-btn sam-btn--outline sam-btn--sm text-[11px]"
                disabled={!detailOrderId || busyOrder === detailOrderId}
                onClick={() => void patchDelivery(detailOrderId, { release_delivery_assignment: true })}
              >
                {t("admin_del_btn_release_rider")}
              </button>
              <button
                type="button"
                className="sam-btn sam-btn--outline sam-btn--sm text-[11px]"
                disabled={!detailOrderId || busyOrder === detailOrderId}
                onClick={() => {
                  const reason = window.prompt(
                    t("admin_del_prompt_failure_reason"),
                    t("admin_del_prompt_failure_default")
                  );
                  if (reason == null) return;
                  void patchDelivery(detailOrderId, {
                    set_delivery_status: "delivery_failed",
                    failure_reason: reason || "delivery_failed",
                  });
                }}
              >
                {t("admin_del_btn_mark_failed")}
              </button>
              <button
                type="button"
                className="sam-btn sam-btn--outline sam-btn--sm text-[11px]"
                disabled={!detailOrderId || busyOrder === detailOrderId}
                onClick={() => void markAttention(detailOrderId)}
              >
                {t("admin_del_btn_mark_attention")}
              </button>
              <Link
                href={`/admin/store-orders?order_id=${encodeURIComponent(detailOrderId)}`}
                className="sam-btn sam-btn--outline sam-btn--sm text-[11px]"
              >
                {t("admin_del_btn_order_admin")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
