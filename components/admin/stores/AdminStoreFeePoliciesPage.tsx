"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  starts_at?: string | null;
  memo?: string | null;
};

type OverviewStore = {
  store_id: string;
  store_name: string;
  slug: string | null;
  category_id: string | null;
  category_name: string | null;
  topic_id: string | null;
  topic_name: string | null;
  has_store_override: boolean;
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
  override_store_count: number;
  topic_wins_store_count: number;
  would_apply_store_count: number;
  policy: {
    id: string;
    fee_percent: number;
    fixed_fee: number;
    policy_name: string;
    starts_at?: string | null;
    memo?: string | null;
  } | null;
};

type OverviewTopic = {
  topic_id: string;
  category_id: string;
  name: string;
  slug: string;
  store_count: number;
  override_store_count: number;
  would_apply_store_count: number;
  policy: {
    id: string;
    fee_percent: number;
    fixed_fee: number;
    policy_name: string;
    starts_at?: string | null;
    memo?: string | null;
  } | null;
};

type ScheduledChange = {
  id: string;
  scope: "store" | "topic" | "category" | "default";
  target_label: string;
  fee_percent: number;
  fixed_fee?: number;
  starts_at: string | null;
  ends_at: string | null;
  policy_name: string;
  memo?: string | null;
};

type PolicyHistoryRow = {
  id: string;
  scope: "store" | "topic" | "category" | "default";
  target_label: string;
  fee_percent: number;
  fixed_fee: number;
  is_active: boolean;
  is_archived: boolean;
  starts_at: string | null;
  ends_at: string | null;
  memo: string | null;
  created_at: string | null;
  updated_at: string | null;
  policy_name: string;
};

type VerificationRow = {
  settlement_id: string;
  settlement_id_short: string;
  order_id: string;
  order_id_short: string;
  store_id: string;
  store_name: string;
  gross_amount: number;
  policy_fee_percent: number | null;
  settlement_fee_percent: number;
  calculated_fee_amount: number;
  settlement_fee_amount: number;
  matched: boolean;
  settlement_status: string | null;
  created_at: string | null;
};

type Overview = {
  summary: {
    stores_total: number;
    applied_default: number;
    applied_category: number;
    applied_topic: number;
    applied_business: number;
    applied_store: number;
    missing_policy: number;
    reserved_future: number;
    inactive_policies: number;
    verification_mismatch: number;
    pct_business: number;
    pct_store: number;
    pct_default: number;
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
  scheduled_changes: ScheduledChange[];
  policy_history: PolicyHistoryRow[];
  verification: VerificationRow[];
};

type ApplyTarget =
  | { kind: "default"; policyId: string | null }
  | { kind: "category"; categoryId: string; name: string; policyId: string | null }
  | { kind: "topic"; topicId: string; name: string; policyId: string | null }
  | { kind: "store"; storeId: string; name: string; policyId: string | null };

type TabId = "status" | "taxonomy" | "stores" | "history" | "verify";
type StoreFilter = "all" | "override" | "inherit" | "missing";

function fmtPercent(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtMoney(n: number) {
  return `${Math.round(n).toLocaleString()} PHP`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
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

function panelClass() {
  return "rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm";
}

export function AdminStoreFeePoliciesPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [legacyRows, setLegacyRows] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("status");
  const [sampleQuery, setSampleQuery] = useState("");
  const [sampleStoreId, setSampleStoreId] = useState<string | null>(null);
  const [storeQuery, setStoreQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const [verifyMismatchOnly, setVerifyMismatchOnly] = useState(false);
  const [verifyStoreQuery, setVerifyStoreQuery] = useState("");
  const [ladderStoreId, setLadderStoreId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      const stores = oJson.stores ?? [];
      setOverview({
        summary: {
          stores_total: oJson.summary?.stores_total ?? 0,
          applied_default: oJson.summary?.applied_default ?? 0,
          applied_category: oJson.summary?.applied_category ?? 0,
          applied_topic: oJson.summary?.applied_topic ?? 0,
          applied_business:
            oJson.summary?.applied_business ??
            (oJson.summary?.applied_category ?? 0) + (oJson.summary?.applied_topic ?? 0),
          applied_store: oJson.summary?.applied_store ?? 0,
          missing_policy: oJson.summary?.missing_policy ?? 0,
          reserved_future: oJson.summary?.reserved_future ?? 0,
          inactive_policies: oJson.summary?.inactive_policies ?? 0,
          verification_mismatch: oJson.summary?.verification_mismatch ?? 0,
          pct_business: oJson.summary?.pct_business ?? 0,
          pct_store: oJson.summary?.pct_store ?? 0,
          pct_default: oJson.summary?.pct_default ?? 0,
        },
        platform_default: oJson.platform_default ?? null,
        categories: oJson.categories ?? [],
        topics: oJson.topics ?? [],
        stores,
        scheduled_changes: oJson.scheduled_changes ?? [],
        policy_history: oJson.policy_history ?? [],
        verification: oJson.verification ?? [],
      });
      if (pJson.ok) setLegacyRows(Array.isArray(pJson.policies) ? pJson.policies : []);
      setSampleStoreId((prev) => {
        if (prev && stores.some((s) => s.store_id === prev)) return prev;
        if (stores.length === 0) return null;
        const preferred =
          stores.find((s) => s.effective.scope === "store") ??
          stores.find((s) => !s.effective.missing) ??
          stores[0];
        return preferred.store_id;
      });
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
        : applyTarget.kind === "category" || applyTarget.kind === "topic" || applyTarget.kind === "store"
          ? applyTarget.name
          : "Policy";

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

  const sampleHits = useMemo(() => {
    const list = overview?.stores ?? [];
    const q = sampleQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter(
        (s) =>
          s.store_name.toLowerCase().includes(q) || (s.slug ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [overview?.stores, sampleQuery]);

  const sampleStore = useMemo(
    () => overview?.stores.find((s) => s.store_id === sampleStoreId) ?? null,
    [overview?.stores, sampleStoreId]
  );

  const ladderStore = useMemo(
    () => overview?.stores.find((s) => s.store_id === ladderStoreId) ?? null,
    [overview?.stores, ladderStoreId]
  );

  const filteredStores = useMemo(() => {
    let list = overview?.stores ?? [];
    if (storeFilter === "override") list = list.filter((s) => s.has_store_override);
    else if (storeFilter === "inherit") {
      list = list.filter((s) => !s.has_store_override && !s.effective.missing);
    } else if (storeFilter === "missing") list = list.filter((s) => s.effective.missing);
    const q = storeQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.store_name.toLowerCase().includes(q) ||
        (s.slug ?? "").toLowerCase().includes(q) ||
        (s.category_name ?? "").toLowerCase().includes(q) ||
        (s.topic_name ?? "").toLowerCase().includes(q)
    );
  }, [overview?.stores, storeFilter, storeQuery]);

  const filteredVerification = useMemo(() => {
    let rows = overview?.verification ?? [];
    if (verifyMismatchOnly) rows = rows.filter((r) => !r.matched);
    const q = verifyStoreQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.store_name.toLowerCase().includes(q) ||
          r.order_id_short.toLowerCase().includes(q) ||
          r.order_id.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [overview?.verification, verifyMismatchOnly, verifyStoreQuery]);

  const inactiveLegacy = useMemo(
    () => legacyRows.filter((r) => !r.is_active || r.is_archived),
    [legacyRows]
  );

  const applyImpact = useMemo(() => {
    if (!overview || !applyTarget) return null;
    if (applyTarget.kind === "category") {
      const cat = overview.categories.find((c) => c.category_id === applyTarget.categoryId);
      if (!cat) return null;
      return {
        would: cat.would_apply_store_count,
        override: cat.override_store_count,
        topic: cat.topic_wins_store_count,
        total: cat.store_count,
      };
    }
    if (applyTarget.kind === "topic") {
      const tp = overview.topics.find((x) => x.topic_id === applyTarget.topicId);
      if (!tp) return null;
      return {
        would: tp.would_apply_store_count,
        override: tp.override_store_count,
        topic: 0,
        total: tp.store_count,
      };
    }
    return null;
  }, [applyTarget, overview]);

  const tabs: Array<{ id: TabId; label: MessageKey }> = [
    { id: "status", label: "admin_stores_fee_tab_status" },
    { id: "taxonomy", label: "admin_stores_fee_tab_taxonomy" },
    { id: "stores", label: "admin_stores_fee_tab_stores" },
    { id: "history", label: "admin_stores_fee_tab_history" },
    { id: "verify", label: "admin_stores_fee_tab_verify" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <AdminPageHeader titleKey="admin_page_store_fee_policies" />
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_stores_fee_desc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => void load()}
            className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {t("admin_stores_fee_refresh")}
          </button>
          <button
            type="button"
            disabled={busy || !overview}
            className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => setTab("history")}
          >
            {t("admin_stores_fee_tab_history")}
          </button>
          <button
            type="button"
            disabled={busy || !overview}
            className="rounded bg-sam-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            onClick={() =>
              openApply(
                { kind: "default", policyId: overview?.platform_default?.id ?? null },
                overview?.platform_default?.fee_percent
              )
            }
          >
            {t("admin_stores_fee_platform_edit")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {feePolicyErrorMessage(t, error)}
        </p>
      ) : null}

      {loading && !overview ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : overview ? (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label={t("admin_stores_fee_kpi_platform")}
              value={fmtPercent(overview.platform_default?.fee_percent)}
              hint={overview.platform_default?.policy_name ?? t("admin_stores_fee_platform_missing")}
            />
            <KpiCard
              label={t("admin_stores_fee_kpi_business")}
              value={t("admin_stores_fee_kpi_count_stores", {
                count: overview.summary.applied_business,
              })}
              hint={t("admin_stores_fee_kpi_pct", { pct: overview.summary.pct_business })}
            />
            <KpiCard
              label={t("admin_stores_fee_kpi_store")}
              value={t("admin_stores_fee_kpi_count_stores", {
                count: overview.summary.applied_store,
              })}
              hint={t("admin_stores_fee_kpi_pct", { pct: overview.summary.pct_store })}
            />
            <KpiCard
              label={t("admin_stores_fee_kpi_default")}
              value={t("admin_stores_fee_kpi_count_stores", {
                count: overview.summary.applied_default,
              })}
              hint={t("admin_stores_fee_kpi_pct", { pct: overview.summary.pct_default })}
            />
            <KpiCard
              label={t("admin_stores_fee_kpi_scheduled")}
              value={String(overview.summary.reserved_future)}
            />
            <KpiCard
              label={t("admin_stores_fee_kpi_errors")}
              value={String(overview.summary.missing_policy)}
              hint={
                overview.summary.verification_mismatch > 0
                  ? t("admin_stores_fee_verify_mismatch_count", {
                      count: overview.summary.verification_mismatch,
                    })
                  : undefined
              }
              hintTone={
                overview.summary.missing_policy > 0 || overview.summary.verification_mismatch > 0
                  ? "danger"
                  : "ok"
              }
            />
          </section>

          <div className="flex flex-wrap gap-1 border-b border-sam-border-soft">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`px-3 py-2 text-sm ${
                  tab === item.id
                    ? "border-b-2 border-sam-ink font-semibold text-sam-fg"
                    : "text-sam-muted hover:text-sam-fg"
                }`}
                onClick={() => setTab(item.id)}
              >
                {t(item.label)}
              </button>
            ))}
          </div>

          {tab === "status" ? (
            <StatusCockpit
              overview={overview}
              t={t}
              busy={busy}
              sampleQuery={sampleQuery}
              sampleHits={sampleHits}
              sampleStore={sampleStore}
              onSampleQuery={setSampleQuery}
              onPickSample={(id) => {
                setSampleStoreId(id);
                setSampleQuery("");
              }}
              onOpenApply={openApply}
              onGoto={(id) => setTab(id)}
            />
          ) : null}

          {tab === "taxonomy" ? (
            <TaxonomyManage
              overview={overview}
              t={t}
              busy={busy}
              onSetCategory={(cat) =>
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
              onSetTopic={(cat, tp) =>
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
              onPlatform={() =>
                openApply(
                  { kind: "default", policyId: overview.platform_default?.id ?? null },
                  overview.platform_default?.fee_percent
                )
              }
            />
          ) : null}

          {tab === "stores" ? (
            <StoresManage
              t={t}
              busy={busy}
              storeQuery={storeQuery}
              storeFilter={storeFilter}
              filteredStores={filteredStores}
              onStoreQuery={setStoreQuery}
              onStoreFilter={setStoreFilter}
              onLadder={(id) => setLadderStoreId(id)}
              onSetStore={(s) =>
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
              onClearOverride={(id) => void deactivate(id)}
            />
          ) : null}

          {tab === "history" ? (
            <HistoryTab
              overview={overview}
              t={t}
              busy={busy}
              showAdvanced={showAdvanced}
              inactiveLegacy={inactiveLegacy}
              onToggleAdvanced={() => setShowAdvanced((v) => !v)}
              onArchive={(r) => {
                setArchiveModalRow(r);
                setArchiveReasonDraft("");
                setArchiveModalError(null);
              }}
            />
          ) : null}

          {tab === "verify" ? (
            <VerifyTab
              t={t}
              rows={filteredVerification}
              mismatchOnly={verifyMismatchOnly}
              storeQuery={verifyStoreQuery}
              onMismatchOnly={setVerifyMismatchOnly}
              onStoreQuery={setVerifyStoreQuery}
              total={overview.verification.length}
              mismatch={overview.summary.verification_mismatch}
            />
          ) : null}

          <footer className="rounded-ui-rect border border-sam-border-soft bg-sam-app/50 px-4 py-3 sam-text-xxs text-sam-muted">
            <p>{t("admin_stores_fee_footer_rule")}</p>
            <p className="mt-1">{t("admin_stores_fee_footer_formula")}</p>
            <p className="mt-1">{t("admin_stores_fee_apply_semantics")}</p>
          </footer>
        </>
      ) : null}

      {applyTarget ? (
        <ApplyModal
          t={t}
          busy={busy}
          applyTarget={applyTarget}
          applyImpact={applyImpact}
          feePercent={feePercent}
          fixedFee={fixedFee}
          deliveryMode={deliveryMode}
          deliveryPercent={deliveryPercent}
          timing={timing}
          startsAt={startsAt}
          endsAt={endsAt}
          memo={memo}
          onFeePercent={setFeePercent}
          onFixedFee={setFixedFee}
          onDeliveryMode={setDeliveryMode}
          onDeliveryPercent={setDeliveryPercent}
          onTiming={setTiming}
          onStartsAt={setStartsAt}
          onEndsAt={setEndsAt}
          onMemo={setMemo}
          onClose={closeApply}
          onSubmit={() => void submitApply()}
        />
      ) : null}

      {ladderStore ? (
        <LadderModal
          t={t}
          store={ladderStore}
          onClose={() => setLadderStoreId(null)}
          onSetRate={() => {
            const s = ladderStore;
            setLadderStoreId(null);
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
        />
      ) : null}

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
          >
            <h2 className={OverlayUi.title}>{t("admin_stores_fee_archive_modal_title")}</h2>
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

function KpiCard({
  label,
  value,
  hint,
  hintTone,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "ok" | "danger";
}) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 shadow-sm">
      <p className="sam-text-xxs text-sam-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-sam-fg">{value}</p>
      {hint ? (
        <p
          className={`mt-1 sam-text-xxs ${
            hintTone === "danger"
              ? "text-red-600"
              : hintTone === "ok"
                ? "text-emerald-700"
                : "text-sam-muted"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function StatusCockpit({
  overview,
  t,
  busy,
  sampleQuery,
  sampleHits,
  sampleStore,
  onSampleQuery,
  onPickSample,
  onOpenApply,
  onGoto,
}: {
  overview: Overview;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  sampleQuery: string;
  sampleHits: OverviewStore[];
  sampleStore: OverviewStore | null;
  onSampleQuery: (v: string) => void;
  onPickSample: (id: string) => void;
  onOpenApply: (target: ApplyTarget, seedPercent?: number) => void;
  onGoto: (tab: TabId) => void;
}) {
  const ladderRows = sampleStore
    ? ([
        {
          key: "store" as const,
          label: "admin_stores_fee_priority_1" as MessageKey,
          rate: sampleStore.ladder.store,
          winner: sampleStore.effective.scope === "store",
        },
        {
          key: "topic" as const,
          label: "admin_stores_fee_priority_2" as MessageKey,
          rate: sampleStore.ladder.topic,
          winner: sampleStore.effective.scope === "topic",
        },
        {
          key: "category" as const,
          label: "admin_stores_fee_priority_3" as MessageKey,
          rate: sampleStore.ladder.category,
          winner: sampleStore.effective.scope === "category",
        },
        {
          key: "platform" as const,
          label: "admin_stores_fee_priority_4" as MessageKey,
          rate: sampleStore.ladder.platform,
          winner: sampleStore.effective.scope === "default",
        },
      ] as const)
    : [];

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_status_readonly_hint")}</p>
      <div className="grid gap-3 xl:grid-cols-3">
        <section className={panelClass()}>
          <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_priority_title")}</h2>
          <ol className="mt-3 space-y-2">
            {(
              [
                ["1", "admin_stores_fee_priority_1", "admin_stores_fee_priority_1_desc"],
                ["2", "admin_stores_fee_priority_2", "admin_stores_fee_priority_2_desc"],
                ["3", "admin_stores_fee_priority_3", "admin_stores_fee_priority_3_desc"],
                ["4", "admin_stores_fee_priority_4", "admin_stores_fee_priority_4_desc"],
              ] as const
            ).map(([n, title, desc]) => (
              <li
                key={n}
                className="flex gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sam-ink text-xs font-semibold text-white">
                  {n}
                </span>
                <div>
                  <p className="text-sm font-medium text-sam-fg">{t(title)}</p>
                  <p className="sam-text-xxs text-sam-muted">{t(desc)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <button type="button" className="text-sam-ink underline" onClick={() => onGoto("taxonomy")}>
              {t("admin_stores_fee_goto_taxonomy")}
            </button>
            <button type="button" className="text-sam-ink underline" onClick={() => onGoto("stores")}>
              {t("admin_stores_fee_goto_stores")}
            </button>
            <button type="button" className="text-sam-ink underline" onClick={() => onGoto("verify")}>
              {t("admin_stores_fee_goto_verify")}
            </button>
          </div>
        </section>

        <section className={panelClass()}>
          <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_sample_title")}</h2>
          <div className="relative mt-3">
            <input
              className="w-full rounded border border-sam-border px-2 py-1.5 text-sm"
              placeholder={t("admin_stores_fee_sample_search_ph")}
              value={sampleQuery}
              onChange={(e) => onSampleQuery(e.target.value)}
            />
            {sampleQuery.trim() ? (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-sam-border bg-sam-surface shadow">
                {sampleHits.map((s) => (
                  <li key={s.store_id}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-sam-app"
                      onClick={() => onPickSample(s.store_id)}
                    >
                      {s.store_name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {sampleStore ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-sam-fg">{sampleStore.store_name}</p>
              <ul className="space-y-1.5">
                {ladderRows.map((row) => (
                  <li
                    key={row.key}
                    className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
                      row.winner
                        ? "border border-emerald-300 bg-emerald-50 font-semibold text-emerald-900"
                        : "bg-sam-app text-sam-muted"
                    }`}
                  >
                    <span>{t(row.label)}</span>
                    <span className="tabular-nums">
                      {row.rate.fee_percent == null
                        ? t("admin_stores_fee_ladder_unset")
                        : fmtPercent(row.rate.fee_percent)}
                      {row.winner ? ` · ${t("admin_stores_fee_sample_active")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
                <p className="sam-text-xxs text-sam-muted">{t("admin_stores_fee_detail_current")}</p>
                <p className="text-2xl font-bold tabular-nums text-sam-fg">
                  {sampleStore.effective.missing
                    ? "—"
                    : fmtPercent(sampleStore.effective.fee_percent)}
                </p>
                <p className="mt-1 sam-text-xxs text-sam-muted">
                  {t(reasonKey(sampleStore.effective.scope))}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                className="text-sm text-sam-ink underline disabled:opacity-40"
                onClick={() =>
                  onOpenApply(
                    {
                      kind: "store",
                      storeId: sampleStore.store_id,
                      name: sampleStore.store_name,
                      policyId: sampleStore.ladder.store.policy_id,
                    },
                    sampleStore.ladder.store.fee_percent ?? sampleStore.effective.fee_percent
                  )
                }
              >
                {t("admin_stores_fee_set_rate")}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-sam-muted">{t("admin_stores_fee_sample_empty")}</p>
          )}
        </section>

        <section className={panelClass()}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_schedule_title")}</h2>
            <button type="button" className="text-sm text-sam-ink underline" onClick={() => onGoto("history")}>
              {t("admin_stores_fee_manage")}
            </button>
          </div>
          {overview.scheduled_changes.length === 0 ? (
            <p className="mt-3 text-sm text-sam-muted">{t("admin_stores_fee_schedule_empty")}</p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {overview.scheduled_changes.slice(0, 8).map((row) => (
                <li
                  key={row.id}
                  className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 text-sm"
                >
                  <p className="font-medium text-sam-fg">{row.target_label}</p>
                  <p className="mt-0.5 tabular-nums text-sam-muted">
                    {fmtPercent(row.fee_percent)} · {fmtDate(row.starts_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TaxonomyManage({
  overview,
  t,
  busy,
  onSetCategory,
  onSetTopic,
  onDeactivate,
  onPlatform,
}: {
  overview: Overview;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  onSetCategory: (cat: OverviewCategory) => void;
  onSetTopic: (cat: OverviewCategory, tp: OverviewTopic) => void;
  onDeactivate: (id: string) => void;
  onPlatform: () => void;
}) {
  const platformPct = overview.platform_default?.fee_percent ?? null;

  return (
    <section className={panelClass()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_taxonomy_title")}</h2>
          <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_taxonomy_help")}</p>
          <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_stores_fee_apply_semantics")}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          onClick={onPlatform}
        >
          {overview.platform_default
            ? t("admin_stores_fee_platform_edit")
            : t("admin_stores_fee_set_rate")}
        </button>
      </div>
      <div className="mt-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 text-sm">
        <span className="text-sam-muted">{t("admin_stores_fee_kpi_platform")}: </span>
        <span className="font-semibold tabular-nums text-sam-fg">{fmtPercent(platformPct)}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[960px] w-full text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
            <tr>
              <th className="px-3 py-2">{t("admin_stores_fee_th_primary")}</th>
              <th className="px-3 py-2">{t("admin_stores_fee_th_secondary")}</th>
              <th className="px-3 py-2">{t("admin_stores_fee_th_policy_kind")}</th>
              <th className="px-3 py-2">{t("admin_stores_fee_th_base_fee")}</th>
              <th className="px-3 py-2">{t("admin_stores_fee_th_current_fee")}</th>
              <th className="px-3 py-2">{t("admin_stores_fee_th_applied_stores")}</th>
              <th className="px-3 py-2">{t("admin_stores_fee_th_impact")}</th>
              <th className="px-3 py-2">{t("admin_stores_settlements_th_action")}</th>
            </tr>
          </thead>
          <tbody>
            {overview.categories.map((cat) => {
              const childTopics = overview.topics.filter((tp) => tp.category_id === cat.category_id);
              return (
                <Fragment key={cat.category_id}>
                  <tr className="border-b border-sam-border-soft bg-sam-app/50">
                    <td className="px-3 py-2 font-medium text-sam-fg">{cat.name}</td>
                    <td className="px-3 py-2 text-sam-muted">{t("admin_stores_fee_none_dash")}</td>
                    <td className="px-3 py-2">{t("admin_stores_fee_kind_primary")}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtPercent(platformPct)}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {cat.policy
                        ? fmtPercent(cat.policy.fee_percent)
                        : t("admin_stores_fee_inherit_parent")}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{cat.store_count}</td>
                    <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                      {t("admin_stores_fee_impact_would", { n: cat.would_apply_store_count })}
                      <br />
                      {t("admin_stores_fee_impact_override", { n: cat.override_store_count })}
                      {cat.topic_wins_store_count > 0 ? (
                        <>
                          <br />
                          {t("admin_stores_fee_impact_topic", { n: cat.topic_wins_store_count })}
                        </>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busy}
                        className="text-sm underline disabled:opacity-40"
                        onClick={() => onSetCategory(cat)}
                      >
                        {cat.policy ? t("admin_stores_fee_edit") : t("admin_stores_fee_set_rate")}
                      </button>
                      {cat.policy ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="ml-2 text-sm text-sam-muted underline disabled:opacity-40"
                          onClick={() => onDeactivate(cat.policy!.id)}
                        >
                          {t("admin_stores_fee_deactivate")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {childTopics.map((tp) => (
                    <tr key={tp.topic_id} className="border-b border-sam-border-soft">
                      <td className="px-3 py-2 pl-6 text-sam-muted">└</td>
                      <td className="px-3 py-2 text-sam-fg">{tp.name}</td>
                      <td className="px-3 py-2">{t("admin_stores_fee_kind_secondary")}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {cat.policy ? fmtPercent(cat.policy.fee_percent) : fmtPercent(platformPct)}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium">
                        {tp.policy
                          ? fmtPercent(tp.policy.fee_percent)
                          : t("admin_stores_fee_inherit_parent")}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{tp.store_count}</td>
                      <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                        {t("admin_stores_fee_impact_would", { n: tp.would_apply_store_count })}
                        <br />
                        {t("admin_stores_fee_impact_override", { n: tp.override_store_count })}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={busy}
                          className="text-sm underline disabled:opacity-40"
                          onClick={() => onSetTopic(cat, tp)}
                        >
                          {tp.policy ? t("admin_stores_fee_edit") : t("admin_stores_fee_set_rate")}
                        </button>
                        {tp.policy ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="ml-2 text-sm text-sam-muted underline disabled:opacity-40"
                            onClick={() => onDeactivate(tp.policy!.id)}
                          >
                            {t("admin_stores_fee_deactivate")}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StoresManage({
  t,
  busy,
  storeQuery,
  storeFilter,
  filteredStores,
  onStoreQuery,
  onStoreFilter,
  onLadder,
  onSetStore,
  onClearOverride,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  storeQuery: string;
  storeFilter: StoreFilter;
  filteredStores: OverviewStore[];
  onStoreQuery: (v: string) => void;
  onStoreFilter: (v: StoreFilter) => void;
  onLadder: (id: string) => void;
  onSetStore: (s: OverviewStore) => void;
  onClearOverride: (policyId: string) => void;
}) {
  const filters: Array<{ id: StoreFilter; label: MessageKey }> = [
    { id: "all", label: "admin_stores_fee_filter_all" },
    { id: "override", label: "admin_stores_fee_filter_override" },
    { id: "inherit", label: "admin_stores_fee_filter_inherit" },
    { id: "missing", label: "admin_stores_fee_filter_missing" },
  ];

  return (
    <section className={panelClass()}>
      <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_stores_title")}</h2>
      <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_stores_help")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`rounded px-3 py-1.5 text-sm ${
              storeFilter === f.id
                ? "bg-sam-ink text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
            onClick={() => onStoreFilter(f.id)}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      <input
        className="mt-3 w-full max-w-md rounded border border-sam-border px-2 py-1.5 text-sm"
        placeholder={t("admin_stores_fee_search_store_list")}
        value={storeQuery}
        onChange={(e) => onStoreQuery(e.target.value)}
      />
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[920px] w-full text-left sam-text-body-secondary">
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
                  {[s.category_name, s.topic_name].filter(Boolean).join(" > ") ||
                    t("admin_stores_fee_none_dash")}
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">
                  {s.effective.missing ? "—" : fmtPercent(s.effective.fee_percent)}
                </td>
                <td className="px-3 py-2 text-sam-muted">{t(reasonKey(s.effective.scope))}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => onLadder(s.store_id)}
                    >
                      {t("admin_stores_fee_ladder_title")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-sm underline disabled:opacity-40"
                      onClick={() => onSetStore(s)}
                    >
                      {s.has_store_override
                        ? t("admin_stores_fee_edit")
                        : t("admin_stores_fee_set_rate")}
                    </button>
                    {s.ladder.store.policy_id ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-sm text-sam-muted underline disabled:opacity-40"
                        onClick={() => onClearOverride(s.ladder.store.policy_id!)}
                      >
                        {t("admin_stores_fee_clear_override")}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HistoryTab({
  overview,
  t,
  busy,
  showAdvanced,
  inactiveLegacy,
  onToggleAdvanced,
  onArchive,
}: {
  overview: Overview;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  showAdvanced: boolean;
  inactiveLegacy: PolicyRow[];
  onToggleAdvanced: () => void;
  onArchive: (r: PolicyRow) => void;
}) {
  return (
    <div className="space-y-4">
      <section className={panelClass()}>
        <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_section_scheduled")}</h2>
        {overview.scheduled_changes.length === 0 ? (
          <p className="mt-3 text-sm text-sam-muted">{t("admin_stores_fee_schedule_empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {overview.scheduled_changes.map((row) => (
              <li
                key={row.id}
                className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 text-sm"
              >
                <p className="font-medium text-sam-fg">{row.target_label}</p>
                <p className="mt-0.5 tabular-nums text-sam-muted">
                  {fmtPercent(row.fee_percent)} · {fmtDate(row.starts_at)}
                  {row.ends_at ? ` → ${fmtDate(row.ends_at)}` : ""}
                </p>
                {row.memo ? <p className="mt-0.5 sam-text-xxs text-sam-muted">{row.memo}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={panelClass()}>
        <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_section_history")}</h2>
        <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_history_actor_na")}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[800px] w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_stores_fee_th_target")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_fee")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_active")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_period")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_sample_memo")}</th>
              </tr>
            </thead>
            <tbody>
              {overview.policy_history.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2">
                    <p className="font-medium text-sam-fg">{r.target_label}</p>
                    <p className="sam-text-xxs text-sam-muted">{fmtDate(r.updated_at)}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtPercent(r.fee_percent)}</td>
                  <td className="px-3 py-2">
                    {r.is_archived
                      ? t("admin_stores_fee_archived_badge")
                      : r.is_active
                        ? t("admin_stores_fee_status_on")
                        : "OFF"}
                  </td>
                  <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                    {fmtDate(r.starts_at)} → {fmtDate(r.ends_at)}
                  </td>
                  <td className="px-3 py-2 text-sam-muted">{r.memo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/40 p-4">
        <button type="button" className="text-sm font-medium underline" onClick={onToggleAdvanced}>
          {showAdvanced ? t("admin_stores_fee_hide_advanced") : t("admin_stores_fee_show_advanced")}
        </button>
        {showAdvanced ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[640px] w-full text-left sam-text-body-secondary">
              <thead className="border-b border-sam-border-soft text-sam-muted">
                <tr>
                  <th className="px-2 py-1">{t("admin_stores_fee_th_name")}</th>
                  <th className="px-2 py-1">{t("admin_stores_fee_th_fee")}</th>
                  <th className="px-2 py-1">{t("admin_stores_settlements_th_action")}</th>
                </tr>
              </thead>
              <tbody>
                {inactiveLegacy.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft text-sam-muted">
                    <td className="px-2 py-1">{r.policy_name}</td>
                    <td className="px-2 py-1">{fmtPercent(r.fee_percent)}</td>
                    <td className="px-2 py-1">
                      {!r.is_archived ? (
                        <button
                          type="button"
                          className="text-sm underline"
                          disabled={busy}
                          onClick={() => onArchive(r)}
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
    </div>
  );
}

function VerifyTab({
  t,
  rows,
  mismatchOnly,
  storeQuery,
  onMismatchOnly,
  onStoreQuery,
  total,
  mismatch,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  rows: VerificationRow[];
  mismatchOnly: boolean;
  storeQuery: string;
  onMismatchOnly: (v: boolean) => void;
  onStoreQuery: (v: string) => void;
  total: number;
  mismatch: number;
}) {
  return (
    <section className={panelClass()}>
      <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_verify_title")}</h2>
      <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_verify_subtitle")}</p>
      <p className="mt-1 sam-text-xxs text-sam-muted">
        {t("admin_stores_fee_verify_sample_n", { n: total })} ·{" "}
        {t("admin_stores_fee_verify_mismatch_count", { count: mismatch })}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mismatchOnly}
            onChange={(e) => onMismatchOnly(e.target.checked)}
          />
          {t("admin_stores_fee_verify_mismatch_only")}
        </label>
        <input
          className="w-full max-w-xs rounded border border-sam-border px-2 py-1.5 text-sm"
          placeholder={t("admin_stores_fee_search_store_list")}
          value={storeQuery}
          onChange={(e) => onStoreQuery(e.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-sam-muted">{t("admin_stores_fee_verify_empty")}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[720px] w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_stores_fee_th_store")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_policy")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_calc")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_settlement")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_result")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.settlement_id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2">
                    <p className="font-medium text-sam-fg">{r.store_name}</p>
                    <p className="sam-text-xxs text-sam-muted">#{r.order_id_short}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {fmtPercent(r.policy_fee_percent ?? r.settlement_fee_percent)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtMoney(r.calculated_fee_amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtMoney(r.settlement_fee_amount)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-sm font-medium ${
                        r.matched ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {r.matched
                        ? t("admin_stores_fee_verify_match")
                        : t("admin_stores_fee_verify_mismatch")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LadderModal({
  t,
  store,
  onClose,
  onSetRate,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  store: OverviewStore;
  onClose: () => void;
  onSetRate: () => void;
}) {
  return (
    <DibayOverlayRoot open onClose={onClose} dismissible placement="center" zRole="dialog">
      <div className={`${OverlayUi.dialogPanel} !max-w-lg`} onClick={(e) => e.stopPropagation()}>
        <h2 className={OverlayUi.title}>{t("admin_stores_fee_detail_title")}</h2>
        <div className={`${OverlayUi.body} mt-3 space-y-3`}>
          <p className="font-medium text-sam-fg">{store.store_name}</p>
          <p className="text-3xl font-bold tabular-nums">
            {store.effective.missing ? "—" : fmtPercent(store.effective.fee_percent)}
          </p>
          <p className="text-sm text-sam-muted">{t(reasonKey(store.effective.scope))}</p>
          <ul className="space-y-1 text-sm">
            {(
              [
                ["platform", "admin_stores_fee_reason_default", store.ladder.platform],
                ["category", "admin_stores_fee_reason_category", store.ladder.category],
                ["topic", "admin_stores_fee_reason_topic", store.ladder.topic],
                ["store", "admin_stores_fee_reason_store", store.ladder.store],
              ] as const
            ).map(([key, label, rate]) => {
              const winner =
                (key === "platform" && store.effective.scope === "default") ||
                (key === "category" && store.effective.scope === "category") ||
                (key === "topic" && store.effective.scope === "topic") ||
                (key === "store" && store.effective.scope === "store");
              return (
                <li key={key} className={winner ? "font-semibold text-sam-fg" : "text-sam-muted"}>
                  {t(label)}:{" "}
                  {rate.fee_percent == null
                    ? t("admin_stores_fee_ladder_unset")
                    : fmtPercent(rate.fee_percent)}
                  {winner ? ` ${t("admin_stores_fee_ladder_winner")}` : ""}
                </li>
              );
            })}
          </ul>
        </div>
        <div className={`${OverlayUi.actionsRow} mt-4`}>
          <DibayOverlayButton roleTone="secondary" onClick={onClose}>
            {t("admin_stores_fee_apply_cancel")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="primary" onClick={onSetRate}>
            {t("admin_stores_fee_set_rate")}
          </DibayOverlayButton>
        </div>
      </div>
    </DibayOverlayRoot>
  );
}

function ApplyModal({
  t,
  busy,
  applyTarget,
  applyImpact,
  feePercent,
  fixedFee,
  deliveryMode,
  deliveryPercent,
  timing,
  startsAt,
  endsAt,
  memo,
  onFeePercent,
  onFixedFee,
  onDeliveryMode,
  onDeliveryPercent,
  onTiming,
  onStartsAt,
  onEndsAt,
  onMemo,
  onClose,
  onSubmit,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  applyTarget: ApplyTarget;
  applyImpact: { would: number; override: number; topic: number; total: number } | null;
  feePercent: string;
  fixedFee: string;
  deliveryMode: "none" | "percent";
  deliveryPercent: string;
  timing: "now" | "schedule";
  startsAt: string;
  endsAt: string;
  memo: string;
  onFeePercent: (v: string) => void;
  onFixedFee: (v: string) => void;
  onDeliveryMode: (v: "none" | "percent") => void;
  onDeliveryPercent: (v: string) => void;
  onTiming: (v: "now" | "schedule") => void;
  onStartsAt: (v: string) => void;
  onEndsAt: (v: string) => void;
  onMemo: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <DibayOverlayRoot open onClose={onClose} dismissible={!busy} placement="center" zRole="dialog">
      <div
        className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={OverlayUi.title}>{t("admin_stores_fee_apply_title")}</h2>
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
          {applyImpact ? (
            <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-xxs text-sam-muted">
              <p>{t("admin_stores_fee_apply_semantics")}</p>
              <p className="mt-1">
                {t("admin_stores_fee_impact_would", { n: applyImpact.would })} ·{" "}
                {t("admin_stores_fee_impact_override", { n: applyImpact.override })}
                {applyImpact.topic > 0
                  ? ` · ${t("admin_stores_fee_impact_topic", { n: applyImpact.topic })}`
                  : ""}
              </p>
            </div>
          ) : null}
          <label className="block">
            <span className={OverlayUi.caption}>{t("admin_stores_fee_apply_rate")}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
                value={feePercent}
                onChange={(e) => onFeePercent(e.target.value)}
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
              onChange={(e) => onFixedFee(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="block">
            <span className={OverlayUi.caption}>{t("admin_stores_fee_delivery_optional")}</span>
            <select
              className="mt-1 rounded border border-sam-border px-2 py-1.5 text-sm"
              value={deliveryMode}
              onChange={(e) => onDeliveryMode(e.target.value as "none" | "percent")}
            >
              <option value="none">{t("admin_stores_fee_delivery_none")}</option>
              <option value="percent">{t("admin_stores_fee_delivery_percent")}</option>
            </select>
            {deliveryMode === "percent" ? (
              <input
                className="ml-2 w-24 rounded border border-sam-border px-2 py-1.5 text-sm"
                value={deliveryPercent}
                onChange={(e) => onDeliveryPercent(e.target.value)}
                inputMode="decimal"
              />
            ) : null}
          </label>
          <fieldset>
            <legend className={OverlayUi.caption}>{t("admin_stores_fee_apply_timing")}</legend>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input type="radio" checked={timing === "now"} onChange={() => onTiming("now")} />
              {t("admin_stores_fee_apply_now")}
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={timing === "schedule"}
                onChange={() => onTiming("schedule")}
              />
              {t("admin_stores_fee_apply_schedule")}
            </label>
            {timing === "schedule" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="date"
                  className="rounded border border-sam-border px-2 py-1.5 text-sm"
                  value={startsAt}
                  onChange={(e) => onStartsAt(e.target.value)}
                />
                <input
                  type="date"
                  className="rounded border border-sam-border px-2 py-1.5 text-sm"
                  value={endsAt}
                  onChange={(e) => onEndsAt(e.target.value)}
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
              onChange={(e) => onMemo(e.target.value)}
              placeholder={t("admin_stores_fee_memo_ph")}
            />
          </label>
        </div>
        <div className={`${OverlayUi.actionsRow} mt-4`}>
          <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={onClose}>
            {t("admin_stores_fee_apply_cancel")}
          </DibayOverlayButton>
          <DibayOverlayButton
            roleTone="primary"
            disabled={busy || feePercent.trim() === "" || !Number.isFinite(Number(feePercent))}
            onClick={onSubmit}
          >
            {t("admin_stores_fee_apply_submit")}
          </DibayOverlayButton>
        </div>
      </div>
    </DibayOverlayRoot>
  );
}
