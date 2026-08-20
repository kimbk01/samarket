"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { MessageKey } from "@/lib/i18n/messages";

type PolicyRow = {
  id: string;
  policy_name: string;
  store_id: string | null;
  category_id: string | null;
  topic_id?: string | null;
  fee_percent: number;
  fixed_fee: number;
  delivery_fee_mode: string;
  delivery_fee_percent: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  memo?: string | null;
  is_archived?: boolean;
};

type RateLite = {
  fee_percent: number | null;
  fixed_fee: number | null;
  policy_id: string | null;
  policy_name: string | null;
};

type OverviewStore = {
  store_id: string;
  store_name: string;
  slug: string | null;
  category_id: string | null;
  category_name: string | null;
  topic_id: string | null;
  topic_name: string | null;
  ladder: {
    platform: RateLite;
    category: RateLite;
    topic: RateLite;
    store: RateLite;
  };
  effective: {
    fee_percent: number;
    fixed_fee: number;
    scope: "store" | "topic" | "category" | "default" | "missing_policy";
    policy_id: string | null;
    policy_name: string;
    missing: boolean;
  };
};

type OverviewCategory = {
  category_id: string;
  name: string;
  slug: string;
  store_count: number;
  policy: { id: string; fee_percent: number; fixed_fee: number; policy_name: string } | null;
};

type OverviewTopic = {
  topic_id: string;
  category_id: string;
  name: string;
  slug: string;
  store_count: number;
  policy: { id: string; fee_percent: number; fixed_fee: number; policy_name: string } | null;
};

type Overview = {
  summary: {
    stores_total: number;
    applied_default: number;
    applied_category: number;
    applied_topic: number;
    applied_store: number;
    missing_policy: number;
    reserved_future: number;
    inactive_policies: number;
  };
  platform_default: {
    id: string;
    policy_name: string;
    fee_percent: number;
    fixed_fee: number;
    delivery_fee_mode: string;
    delivery_fee_percent: number;
  } | null;
  categories: OverviewCategory[];
  topics: OverviewTopic[];
  stores: OverviewStore[];
};

type ApplyTarget =
  | { kind: "default"; policyId: string | null }
  | { kind: "category"; categoryId: string; name: string; policyId: string | null }
  | { kind: "topic"; topicId: string; name: string; policyId: string | null }
  | { kind: "store"; storeId: string; name: string; policyId: string | null };

function fmtPercent(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function feePolicyApiErrorCode(error: unknown, httpStatus: number): string {
  const e = typeof error === "string" && error.trim() ? error.trim() : "";
  if (e) return e;
  if (httpStatus === 403) return "forbidden";
  if (httpStatus === 503) return "supabase_unconfigured";
  return `http_error_${httpStatus}`;
}

function feePolicyErrorKey(code: string | undefined): MessageKey | null {
  const c = String(code ?? "").trim();
  switch (c) {
    case "policy_archived":
      return "admin_stores_fee_err_archived";
    case "conflict_default_overlap":
      return "admin_stores_fee_err_conflict_default";
    case "conflict_priority_overlap":
      return "admin_stores_fee_err_conflict_priority";
    case "failed_to_archive":
      return "admin_stores_fee_err_archive_failed";
    case "failed_to_restore":
      return "admin_stores_fee_err_restore_failed";
    case "not_archived":
      return "admin_stores_fee_err_not_archived";
    case "network_error":
      return "common_network_error";
    case "topic_column_missing":
      return "admin_stores_fee_err_topic_column";
    case "topic_not_found":
      return "admin_stores_fee_err_topic_not_found";
    case "table_missing":
      return "admin_stores_fee_err_table_missing";
    case "forbidden":
      return "admin_stores_fee_err_forbidden";
    case "supabase_unconfigured":
      return "admin_stores_fee_err_supabase";
    default:
      return null;
  }
}

function feePolicyErrorMessage(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  code: string | undefined
): string {
  const c = String(code ?? "").trim();
  const key = feePolicyErrorKey(c);
  if (key) return t(key);
  if (/^http_error_\d+$/.test(c)) {
    return t("admin_stores_fee_err_http", { status: c.replace("http_error_", "HTTP ") });
  }
  return c || t("admin_stores_fee_err_generic");
}

function dateInputToIsoRangeStart(d: string): string | null {
  const t = d.trim();
  if (!t) return null;
  const ms = new Date(`${t}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function dateInputToIsoRangeEnd(d: string): string | null {
  const t = d.trim();
  if (!t) return null;
  const ms = new Date(`${t}T23:59:59.999Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function scopePriority(kind: ApplyTarget["kind"]): number {
  if (kind === "store") return 1;
  if (kind === "topic") return 50;
  if (kind === "category") return 75;
  return 100;
}

function reasonKey(scope: OverviewStore["effective"]["scope"]): MessageKey {
  if (scope === "store") return "admin_stores_fee_reason_store";
  if (scope === "topic") return "admin_stores_fee_reason_topic";
  if (scope === "category") return "admin_stores_fee_reason_category";
  if (scope === "missing_policy") return "admin_stores_fee_reason_missing";
  return "admin_stores_fee_reason_default";
}

export function AdminStoreFeePoliciesPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [legacyRows, setLegacyRows] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);

  const [applyTarget, setApplyTarget] = useState<ApplyTarget | null>(null);
  const [feePercent, setFeePercent] = useState("");
  const [fixedFee, setFixedFee] = useState("0");
  const [deliveryMode, setDeliveryMode] = useState<"none" | "percent">("none");
  const [deliveryPercent, setDeliveryPercent] = useState("0");
  const [timing, setTiming] = useState<"now" | "schedule">("now");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [memo, setMemo] = useState("");

  const [archiveModalRow, setArchiveModalRow] = useState<PolicyRow | null>(null);
  const [archiveReasonDraft, setArchiveReasonDraft] = useState("");
  const [archiveModalError, setArchiveModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [oRes, pRes] = await Promise.all([
        fetch("/api/admin/store-fee-policies/overview", { credentials: "include" }),
        fetch("/api/admin/store-fee-policies?active_only=0&include_archived=1", {
          credentials: "include",
        }),
      ]);
      const oJson = (await oRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      } & Partial<Overview>;
      const pJson = (await pRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        policies?: PolicyRow[];
      };
      if (!oJson.ok) {
        setOverview(null);
        setError(feePolicyApiErrorCode(oJson.error, oRes.status));
        return;
      }
      setOverview({
        summary: oJson.summary!,
        platform_default: oJson.platform_default ?? null,
        categories: oJson.categories ?? [],
        topics: oJson.topics ?? [],
        stores: oJson.stores ?? [],
      });
      if (pJson.ok) setLegacyRows(Array.isArray(pJson.policies) ? pJson.policies : []);
    } catch {
      setOverview(null);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openApply = useCallback((target: ApplyTarget, seedPercent?: number) => {
    setApplyTarget(target);
    setFeePercent(seedPercent != null && Number.isFinite(seedPercent) ? String(seedPercent) : "");
    setFixedFee("0");
    setDeliveryMode("none");
    setDeliveryPercent("0");
    setTiming("now");
    setStartsAt("");
    setEndsAt("");
    setMemo("");
    setError(null);
  }, []);

  const closeApply = useCallback(() => {
    if (busy) return;
    setApplyTarget(null);
  }, [busy]);

  const submitApply = useCallback(async () => {
    if (!applyTarget) return;
    if (!Number.isFinite(Number(feePercent))) return;
    setBusy(true);
    setError(null);

    const autoName =
      applyTarget.kind === "default"
        ? "Platform Default"
        : applyTarget.kind === "category"
          ? applyTarget.name
          : applyTarget.kind === "topic"
            ? applyTarget.name
            : applyTarget.name;

    const body: Record<string, unknown> = {
      policy_name: autoName.slice(0, 80),
      fee_percent: Number(feePercent),
      fixed_fee: Math.max(0, Math.round(Number(fixedFee) || 0)),
      delivery_fee_mode: deliveryMode,
      delivery_fee_percent: Number(deliveryPercent) || 0,
      is_active: true,
      priority: scopePriority(applyTarget.kind),
      starts_at: timing === "schedule" ? dateInputToIsoRangeStart(startsAt) : null,
      ends_at: timing === "schedule" ? dateInputToIsoRangeEnd(endsAt) : null,
      memo: memo.trim() ? memo.trim().slice(0, 1000) : null,
      store_id: null,
      category_id: null,
      topic_id: null,
    };

    if (applyTarget.kind === "category") body.category_id = applyTarget.categoryId;
    if (applyTarget.kind === "topic") body.topic_id = applyTarget.topicId;
    if (applyTarget.kind === "store") body.store_id = applyTarget.storeId;

    try {
      const editingId = applyTarget.policyId;
      const res = editingId
        ? await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(editingId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/admin/store-fee-policies", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(feePolicyApiErrorCode(json.error, res.status));
        return;
      }
      setApplyTarget(null);
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }, [
    applyTarget,
    deliveryMode,
    deliveryPercent,
    feePercent,
    fixedFee,
    load,
    memo,
    startsAt,
    endsAt,
    timing,
  ]);

  const deactivate = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!json.ok) {
          setError(feePolicyApiErrorCode(json.error, res.status));
          return;
        }
        await load();
      } catch {
        setError("network_error");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const confirmArchive = useCallback(async () => {
    const row = archiveModalRow;
    if (!row) return;
    setBusy(true);
    setArchiveModalError(null);
    try {
      const reason = archiveReasonDraft.trim();
      const res = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive_reason: reason ? reason.slice(0, 2000) : null }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setArchiveModalError(feePolicyErrorMessage(t, feePolicyApiErrorCode(json.error, res.status)));
        return;
      }
      setArchiveModalRow(null);
      setArchiveReasonDraft("");
      await load();
    } catch {
      setArchiveModalError(feePolicyErrorMessage(t, "network_error"));
    } finally {
      setBusy(false);
    }
  }, [archiveModalRow, archiveReasonDraft, load, t]);

  const filteredStores = useMemo(() => {
    const list = overview?.stores ?? [];
    const q = storeQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.store_name.toLowerCase().includes(q) ||
        (s.slug ?? "").toLowerCase().includes(q) ||
        (s.category_name ?? "").toLowerCase().includes(q) ||
        (s.topic_name ?? "").toLowerCase().includes(q)
    );
  }, [overview?.stores, storeQuery]);

  const detailStore = useMemo(
    () => overview?.stores.find((s) => s.store_id === detailStoreId) ?? null,
    [detailStoreId, overview?.stores]
  );

  const inactiveLegacy = useMemo(
    () => legacyRows.filter((r) => !r.is_active || r.is_archived),
    [legacyRows]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_fee_policies" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_fee_desc")}</p>

      {error ? (
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {feePolicyErrorMessage(t, error)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void load()}
          className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {t("admin_stores_fee_refresh")}
        </button>
      </div>

      {loading && !overview ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : overview ? (
        <>
          {/* Summary */}
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_summary_title")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ["admin_stores_fee_summary_stores", overview.summary.stores_total],
                  ["admin_stores_fee_summary_default", overview.summary.applied_default],
                  ["admin_stores_fee_summary_category", overview.summary.applied_category],
                  ["admin_stores_fee_summary_topic", overview.summary.applied_topic],
                  ["admin_stores_fee_summary_store", overview.summary.applied_store],
                  ["admin_stores_fee_summary_missing", overview.summary.missing_policy],
                ] as const
              ).map(([key, val]) => (
                <div key={key} className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{t(key)}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-sam-fg">{val}</p>
                </div>
              ))}
            </div>
            {overview.summary.reserved_future > 0 ? (
              <p className="mt-2 sam-text-xxs text-sam-muted">
                {t("admin_stores_fee_summary_reserved")}: {overview.summary.reserved_future}
              </p>
            ) : null}
          </section>

          {/* Platform default */}
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_platform_title")}</h2>
                <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_platform_help")}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                onClick={() =>
                  openApply(
                    {
                      kind: "default",
                      policyId: overview.platform_default?.id ?? null,
                    },
                    overview.platform_default?.fee_percent
                  )
                }
              >
                {overview.platform_default ? t("admin_stores_fee_edit") : t("admin_stores_fee_set_rate")}
              </button>
            </div>
            {overview.platform_default ? (
              <div className="mt-4">
                <p className="text-3xl font-bold tabular-nums text-sam-fg">
                  {fmtPercent(overview.platform_default.fee_percent)}
                </p>
                {overview.platform_default.fixed_fee > 0 ? (
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    + {overview.platform_default.fixed_fee} PHP
                  </p>
                ) : null}
                <p className="mt-2 sam-text-xxs text-sam-muted">
                  {t("admin_stores_fee_platform_stores", {
                    count: overview.summary.applied_default,
                  })}
                </p>
                {overview.platform_default.id ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-3 text-sm text-sam-muted underline disabled:opacity-40"
                    onClick={() => void deactivate(overview.platform_default!.id)}
                  >
                    {t("admin_stores_fee_deactivate")}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-amber-800">{t("admin_stores_fee_platform_missing")}</p>
            )}
          </section>

          {/* Taxonomy */}
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_taxonomy_title")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_taxonomy_help")}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[720px] w-full text-left sam-text-body-secondary">
                <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
                  <tr>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_primary")}</th>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_secondary")}</th>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_fee")}</th>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_applied_stores")}</th>
                    <th className="px-3 py-2">{t("admin_stores_settlements_th_action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.categories.map((cat) => {
                    const childTopics = overview.topics.filter((tp) => tp.category_id === cat.category_id);
                    return (
                      <FragmentCategory
                        key={cat.category_id}
                        cat={cat}
                        topics={childTopics}
                        t={t}
                        busy={busy}
                        onSetCategory={() =>
                          openApply(
                            {
                              kind: "category",
                              categoryId: cat.category_id,
                              name: cat.name,
                              policyId: cat.policy?.id ?? null,
                            },
                            cat.policy?.fee_percent
                          )
                        }
                        onSetTopic={(tp) =>
                          openApply(
                            {
                              kind: "topic",
                              topicId: tp.topic_id,
                              name: `${cat.name} > ${tp.name}`,
                              policyId: tp.policy?.id ?? null,
                            },
                            tp.policy?.fee_percent
                          )
                        }
                        onDeactivate={(id) => void deactivate(id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Stores */}
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_stores_title")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_stores_help")}</p>
            <input
              className="mt-3 w-full max-w-md rounded border border-sam-border px-2 py-1.5 text-sm"
              placeholder={t("admin_stores_fee_search_store_list")}
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.target.value)}
            />
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[860px] w-full text-left sam-text-body-secondary">
                <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
                  <tr>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_store")}</th>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_taxonomy")}</th>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_effective")}</th>
                    <th className="px-3 py-2">{t("admin_stores_fee_th_reason")}</th>
                    <th className="px-3 py-2">{t("admin_stores_settlements_th_action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map((s) => (
                    <tr key={s.store_id} className="border-b border-sam-border-soft">
                      <td className="px-3 py-2 font-medium text-sam-fg">
                        {s.store_name}
                        {s.slug ? (
                          <span className="ml-1 sam-text-xxs font-normal text-sam-muted">/{s.slug}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-sam-muted">
                        {[s.category_name, s.topic_name].filter(Boolean).join(" > ") || "—"}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-sam-fg">
                        {s.effective.missing ? "—" : fmtPercent(s.effective.fee_percent)}
                      </td>
                      <td className="px-3 py-2 text-sam-muted">{t(reasonKey(s.effective.scope))}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-sm text-sam-ink underline"
                            onClick={() => setDetailStoreId(s.store_id)}
                          >
                            {t("admin_stores_fee_detail_title")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="text-sm text-sam-ink underline disabled:opacity-40"
                            onClick={() =>
                              openApply(
                                {
                                  kind: "store",
                                  storeId: s.store_id,
                                  name: s.store_name,
                                  policyId: s.ladder.store.policy_id,
                                },
                                s.ladder.store.fee_percent ?? s.effective.fee_percent
                              )
                            }
                          >
                            {t("admin_stores_fee_set_rate")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Advanced */}
          <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/40 p-4">
            <button
              type="button"
              className="text-sm font-medium text-sam-fg underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? t("admin_stores_fee_hide_advanced") : t("admin_stores_fee_show_advanced")}
            </button>
            <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_stores_fee_advanced_help")}</p>
            {showAdvanced ? (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[720px] w-full text-left sam-text-body-secondary">
                  <thead className="border-b border-sam-border-soft text-sam-muted">
                    <tr>
                      <th className="px-2 py-1">{t("admin_stores_fee_th_name")}</th>
                      <th className="px-2 py-1">{t("admin_stores_fee_th_fee")}</th>
                      <th className="px-2 py-1">{t("admin_stores_fee_th_active")}</th>
                      <th className="px-2 py-1">{t("admin_stores_settlements_th_action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveLegacy.map((r) => (
                      <tr key={r.id} className="border-b border-sam-border-soft text-sam-muted">
                        <td className="px-2 py-1">{r.policy_name}</td>
                        <td className="px-2 py-1">{fmtPercent(r.fee_percent)}</td>
                        <td className="px-2 py-1">
                          {r.is_archived ? t("admin_stores_fee_archived_badge") : r.is_active ? "ON" : "OFF"}
                        </td>
                        <td className="px-2 py-1">
                          {!r.is_archived ? (
                            <button
                              type="button"
                              className="text-sm underline"
                              disabled={busy}
                              onClick={() => {
                                setArchiveModalRow(r);
                                setArchiveReasonDraft("");
                                setArchiveModalError(null);
                              }}
                            >
                              {t("admin_stores_fee_archive")}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {/* Apply modal */}
      {applyTarget ? (
        <DibayOverlayRoot
          open
          onClose={closeApply}
          dismissible={!busy}
          placement="center"
          zRole="dialog"
        >
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
            aria-labelledby="fee-apply-title"
          >
            <h2 id="fee-apply-title" className={OverlayUi.title}>
              {t("admin_stores_fee_apply_title")}
            </h2>
            <div className={`${OverlayUi.body} mt-3 space-y-3`}>
              <div>
                <p className={OverlayUi.caption}>{t("admin_stores_fee_apply_target")}</p>
                <p className="text-sm text-sam-fg">
                  {applyTarget.kind === "default"
                    ? t("admin_stores_fee_scope_default")
                    : applyTarget.kind === "category"
                      ? `${t("admin_stores_fee_scope_category")}: ${applyTarget.name}`
                      : applyTarget.kind === "topic"
                        ? `${t("admin_stores_fee_scope_topic")}: ${applyTarget.name}`
                        : `${t("admin_stores_fee_scope_store")}: ${applyTarget.name}`}
                </p>
              </div>
              <label className="block">
                <span className={OverlayUi.caption}>{t("admin_stores_fee_apply_rate")}</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
                    value={feePercent}
                    onChange={(e) => setFeePercent(e.target.value)}
                    inputMode="decimal"
                  />
                  <span className="text-sm text-sam-muted">%</span>
                </div>
              </label>
              <label className="block">
                <span className={OverlayUi.caption}>{t("admin_stores_fee_fixed_optional")}</span>
                <input
                  className="mt-1 w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
                  value={fixedFee}
                  onChange={(e) => setFixedFee(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className="block">
                <span className={OverlayUi.caption}>{t("admin_stores_fee_delivery_optional")}</span>
                <select
                  className="mt-1 rounded border border-sam-border px-2 py-1.5 text-sm"
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value as "none" | "percent")}
                >
                  <option value="none">{t("admin_stores_fee_delivery_none")}</option>
                  <option value="percent">{t("admin_stores_fee_delivery_percent")}</option>
                </select>
                {deliveryMode === "percent" ? (
                  <input
                    className="ml-2 w-24 rounded border border-sam-border px-2 py-1.5 text-sm"
                    value={deliveryPercent}
                    onChange={(e) => setDeliveryPercent(e.target.value)}
                    inputMode="decimal"
                  />
                ) : null}
              </label>
              <fieldset>
                <legend className={OverlayUi.caption}>{t("admin_stores_fee_apply_timing")}</legend>
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input type="radio" checked={timing === "now"} onChange={() => setTiming("now")} />
                  {t("admin_stores_fee_apply_now")}
                </label>
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={timing === "schedule"}
                    onChange={() => setTiming("schedule")}
                  />
                  {t("admin_stores_fee_apply_schedule")}
                </label>
                {timing === "schedule" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      type="date"
                      className="rounded border border-sam-border px-2 py-1.5 text-sm"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                    <input
                      type="date"
                      className="rounded border border-sam-border px-2 py-1.5 text-sm"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </div>
                ) : null}
              </fieldset>
              <label className="block">
                <span className={OverlayUi.caption}>{t("admin_stores_fee_apply_reason")}</span>
                <textarea
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                  rows={2}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t("admin_stores_fee_memo_ph")}
                />
              </label>
            </div>
            <div className={`${OverlayUi.actionsRow} mt-4`}>
              <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={closeApply}>
                {t("admin_stores_fee_apply_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="primary"
                disabled={busy || feePercent.trim() === "" || !Number.isFinite(Number(feePercent))}
                onClick={() => void submitApply()}
              >
                {t("admin_stores_fee_apply_submit")}
              </DibayOverlayButton>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}

      {/* Store detail */}
      {detailStore ? (
        <DibayOverlayRoot
          open
          onClose={() => setDetailStoreId(null)}
          dismissible
          placement="center"
          zRole="dialog"
        >
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
            aria-labelledby="fee-detail-title"
          >
            <h2 id="fee-detail-title" className={OverlayUi.title}>
              {t("admin_stores_fee_detail_title")}
            </h2>
            <div className={`${OverlayUi.body} mt-3 space-y-3`}>
              <p className="font-medium text-sam-fg">
                {detailStore.store_name}
                {detailStore.slug ? (
                  <span className="ml-1 text-sam-muted">/{detailStore.slug}</span>
                ) : null}
              </p>
              <p className="sam-text-helper text-sam-muted">
                {[detailStore.category_name, detailStore.topic_name].filter(Boolean).join(" > ") ||
                  "—"}
              </p>
              <div>
                <p className={OverlayUi.caption}>{t("admin_stores_fee_detail_current")}</p>
                <p className="text-3xl font-bold tabular-nums text-sam-fg">
                  {detailStore.effective.missing
                    ? "—"
                    : fmtPercent(detailStore.effective.fee_percent)}
                </p>
                <p className="mt-1 text-sm text-sam-muted">
                  {t(reasonKey(detailStore.effective.scope))}
                </p>
              </div>
              <div>
                <p className={OverlayUi.caption}>{t("admin_stores_fee_ladder_title")}</p>
                <ul className="mt-2 space-y-1 text-sm text-sam-fg">
                  {(
                    [
                      ["platform", "admin_stores_fee_reason_default"],
                      ["category", "admin_stores_fee_reason_category"],
                      ["topic", "admin_stores_fee_reason_topic"],
                      ["store", "admin_stores_fee_reason_store"],
                    ] as const
                  ).map(([key, labelKey]) => {
                    const rate = detailStore.ladder[key];
                    const winner =
                      (key === "platform" && detailStore.effective.scope === "default") ||
                      (key === "category" && detailStore.effective.scope === "category") ||
                      (key === "topic" && detailStore.effective.scope === "topic") ||
                      (key === "store" && detailStore.effective.scope === "store");
                    return (
                      <li key={key} className={winner ? "font-semibold" : "text-sam-muted"}>
                        {t(labelKey)}:{" "}
                        {rate.fee_percent == null
                          ? t("admin_stores_fee_ladder_unset")
                          : fmtPercent(rate.fee_percent)}
                        {winner ? ` ${t("admin_stores_fee_ladder_winner")}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div className={`${OverlayUi.actionsRow} mt-4`}>
              <DibayOverlayButton roleTone="secondary" onClick={() => setDetailStoreId(null)}>
                {t("admin_stores_fee_apply_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="primary"
                onClick={() => {
                  const s = detailStore;
                  setDetailStoreId(null);
                  openApply(
                    {
                      kind: "store",
                      storeId: s.store_id,
                      name: s.store_name,
                      policyId: s.ladder.store.policy_id,
                    },
                    s.ladder.store.fee_percent ?? s.effective.fee_percent
                  );
                }}
              >
                {t("admin_stores_fee_set_rate")}
              </DibayOverlayButton>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}

      {/* Archive modal */}
      {archiveModalRow ? (
        <DibayOverlayRoot
          open
          onClose={() => {
            if (busy) return;
            setArchiveModalRow(null);
            setArchiveReasonDraft("");
            setArchiveModalError(null);
          }}
          dismissible={!busy}
          placement="center"
          zRole="dialog"
        >
          <div
            className={`${OverlayUi.dialogPanel} !max-w-md`}
            onClick={(e) => e.stopPropagation()}
            aria-labelledby="fee-archive-title"
          >
            <h2 id="fee-archive-title" className={OverlayUi.title}>
              {t("admin_stores_fee_archive_modal_title")}
            </h2>
            <p className={`${OverlayUi.bodySecondary} mt-2`}>
              {t("admin_stores_fee_archive_modal_desc")}
            </p>
            <textarea
              className="mt-3 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
              rows={3}
              value={archiveReasonDraft}
              onChange={(e) => setArchiveReasonDraft(e.target.value)}
              placeholder={t("admin_stores_fee_archive_reason_ph")}
            />
            {archiveModalError ? (
              <p className="mt-2 text-sm text-amber-800">{archiveModalError}</p>
            ) : null}
            <div className={`${OverlayUi.actionsRow} mt-4`}>
              <DibayOverlayButton
                roleTone="secondary"
                disabled={busy}
                onClick={() => {
                  setArchiveModalRow(null);
                  setArchiveReasonDraft("");
                  setArchiveModalError(null);
                }}
              >
                {t("admin_stores_fee_apply_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="destructive"
                disabled={busy}
                onClick={() => void confirmArchive()}
              >
                {t("admin_stores_fee_archive")}
              </DibayOverlayButton>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}
    </div>
  );
}

function FragmentCategory({
  cat,
  topics,
  t,
  busy,
  onSetCategory,
  onSetTopic,
  onDeactivate,
}: {
  cat: OverviewCategory;
  topics: OverviewTopic[];
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  onSetCategory: () => void;
  onSetTopic: (tp: OverviewTopic) => void;
  onDeactivate: (id: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-sam-border-soft bg-sam-app/50">
        <td className="px-3 py-2 font-medium text-sam-fg">{cat.name}</td>
        <td className="px-3 py-2 text-sam-muted">—</td>
        <td className="px-3 py-2 tabular-nums">
          {cat.policy ? fmtPercent(cat.policy.fee_percent) : t("admin_stores_fee_inherit")}
        </td>
        <td className="px-3 py-2 tabular-nums text-sam-muted">{cat.store_count}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className="text-sm underline disabled:opacity-40" onClick={onSetCategory}>
              {cat.policy ? t("admin_stores_fee_edit") : t("admin_stores_fee_set_rate")}
            </button>
            {cat.policy ? (
              <button
                type="button"
                disabled={busy}
                className="text-sm text-sam-muted underline disabled:opacity-40"
                onClick={() => onDeactivate(cat.policy!.id)}
              >
                {t("admin_stores_fee_deactivate")}
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {topics.map((tp) => (
        <tr key={tp.topic_id} className="border-b border-sam-border-soft">
          <td className="px-3 py-2 pl-6 text-sam-muted">└</td>
          <td className="px-3 py-2 text-sam-fg">{tp.name}</td>
          <td className="px-3 py-2 tabular-nums">
            {tp.policy ? fmtPercent(tp.policy.fee_percent) : t("admin_stores_fee_inherit")}
          </td>
          <td className="px-3 py-2 tabular-nums text-sam-muted">{tp.store_count}</td>
          <td className="px-3 py-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="text-sm underline disabled:opacity-40"
                onClick={() => onSetTopic(tp)}
              >
                {tp.policy ? t("admin_stores_fee_edit") : t("admin_stores_fee_set_rate")}
              </button>
              {tp.policy ? (
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-sam-muted underline disabled:opacity-40"
                  onClick={() => onDeactivate(tp.policy!.id)}
                >
                  {t("admin_stores_fee_deactivate")}
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
