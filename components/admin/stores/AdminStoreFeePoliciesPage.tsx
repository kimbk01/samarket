"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { MessageKey } from "@/lib/i18n/messages";

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
  store_count: number;
  override_store_count: number;
  topic_wins_store_count: number;
  would_apply_store_count: number;
  policy: {
    id: string;
    fee_percent: number;
    fixed_fee: number;
    policy_name: string;
  } | null;
};

type OverviewTopic = {
  topic_id: string;
  category_id: string;
  name: string;
  store_count: number;
  override_store_count: number;
  would_apply_store_count: number;
  policy: {
    id: string;
    fee_percent: number;
    fixed_fee: number;
    policy_name: string;
  } | null;
};

type ScheduledChange = {
  id: string;
  scope: "store" | "topic" | "category" | "default";
  target_label: string;
  fee_percent: number;
  fixed_fee: number;
  starts_at: string | null;
  ends_at: string | null;
  policy_name: string;
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
  updated_at: string | null;
  policy_name: string;
};

type VerifyRow = {
  settlement_id: string;
  settlement_id_short: string;
  order_id: string;
  order_id_short: string;
  store_id: string;
  store_name: string;
  gross_amount: number;
  policy_fee_percent: number | null;
  policy_fixed_fee?: number;
  settlement_fee_percent: number;
  settlement_fixed_fee?: number;
  calculated_fee_amount: number;
  settlement_fee_amount: number;
  matched: boolean;
  settlement_status: string;
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
    verification_mismatch: number;
  };
  platform_default: {
    id: string;
    policy_name: string;
    fee_percent: number;
    fixed_fee: number;
  } | null;
  categories: OverviewCategory[];
  topics: OverviewTopic[];
  stores: OverviewStore[];
  scheduled_changes: ScheduledChange[];
  policy_history: PolicyHistoryRow[];
  verification: VerifyRow[];
};

type TabId = "industry" | "stores" | "verify" | "history";
type IndustryLevel = "category" | "topic";
type Timing = "now" | "schedule";

type ApplyTarget =
  | { kind: "default"; policyId: string | null }
  | { kind: "category"; categoryId: string; name: string; policyId: string | null }
  | { kind: "topic"; topicId: string; name: string; policyId: string | null }
  | { kind: "store"; storeId: string; name: string; policyId: string | null }
  | { kind: "stores_bulk"; stores: Array<{ storeId: string; name: string; policyId: string | null }> };

function panelClass() {
  return "rounded-ui-rect border border-sam-border bg-sam-surface p-4";
}

/** Always show % + PHP — product fee is fee_percent + fixed_fee. */
function fmtRate(pct: number | null | undefined, fixed?: number | null) {
  if (pct == null || !Number.isFinite(Number(pct))) return "—";
  const p = Number(pct);
  const f = Math.round(Number(fixed) || 0);
  return f > 0 ? `${p}% + ${f} PHP` : `${p}% + 0 PHP`;
}

function fmtMoney(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString()} PHP`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function previewFee(gross: number, pct: number, fixed: number) {
  const percentFee = Math.min(gross, Math.floor((gross * pct) / 100));
  return Math.min(gross, percentFee + fixed);
}

function feePolicyApiErrorCode(error: unknown, httpStatus: number): string {
  const e = String(error ?? "").trim();
  if (httpStatus === 403) return "forbidden";
  if (httpStatus === 409) {
    if (e.includes("conflict_priority_overlap")) return "conflict_priority_overlap";
    if (e.includes("conflict_default_overlap")) return "conflict_default_overlap";
    return "conflict";
  }
  if (e === "table_missing" || e === "supabase_unconfigured") return e;
  if (e === "topic_column_missing") return e;
  if (e === "invalid_window") return e;
  if (e === "policy_name_required") return e;
  if (httpStatus >= 500) return "server_error";
  return e || "unknown_error";
}

function feePolicyErrorMessage(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  code: string
) {
  const map: Record<string, MessageKey> = {
    forbidden: "admin_stores_fee_err_forbidden",
    table_missing: "admin_stores_fee_err_table_missing",
    supabase_unconfigured: "admin_stores_fee_err_supabase",
    conflict_priority_overlap: "admin_stores_fee_err_conflict_priority",
    conflict_default_overlap: "admin_stores_fee_err_conflict_default",
    conflict: "admin_stores_fee_err_conflict_priority",
    topic_column_missing: "admin_stores_fee_err_topic_column",
    invalid_window: "admin_stores_fee_err_invalid_window",
    policy_name_required: "admin_stores_fee_err_name_required",
    network_error: "admin_stores_fee_err_network",
    server_error: "admin_stores_fee_err_generic",
  };
  const key = map[code];
  if (key) return t(key);
  return t("admin_stores_fee_err_generic");
}

function dateInputToIsoRangeStart(d: string): string | null {
  const s = d.trim();
  if (!s) return null;
  const t = new Date(`${s}T00:00:00.000Z`).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function dateInputToIsoRangeEnd(d: string): string | null {
  const s = d.trim();
  if (!s) return null;
  const t = new Date(`${s}T23:59:59.999Z`).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function scopePriority(kind: ApplyTarget["kind"]): number {
  if (kind === "store" || kind === "stores_bulk") return 10;
  if (kind === "topic") return 40;
  if (kind === "category") return 60;
  return 100;
}

function reasonKey(scope: OverviewStore["effective"]["scope"]): MessageKey {
  if (scope === "store") return "admin_stores_fee_reason_store";
  if (scope === "topic") return "admin_stores_fee_reason_topic";
  if (scope === "category") return "admin_stores_fee_reason_category";
  if (scope === "missing_policy") return "admin_stores_fee_reason_missing";
  return "admin_stores_fee_reason_default";
}

async function upsertPolicy(opts: {
  policyId: string | null;
  body: Record<string, unknown>;
  timing: Timing;
  startsAtIso: string | null;
  endsAtIso: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { policyId, body, timing, startsAtIso, endsAtIso } = opts;

  // Schedule: close current window at starts_at, then insert next window (half-open).
  if (timing === "schedule") {
    if (!startsAtIso) {
      return { ok: false, error: "invalid_window", status: 400 };
    }
    if (policyId) {
      const closeRes = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(policyId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ends_at: startsAtIso }),
      });
      const closeJson = (await closeRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!closeJson.ok) {
        return {
          ok: false,
          error: feePolicyApiErrorCode(closeJson.error, closeRes.status),
          status: closeRes.status,
        };
      }
    }
    const createRes = await fetch("/api/admin/store-fee-policies", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
      }),
    });
    const createJson = (await createRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!createJson.ok) {
      return {
        ok: false,
        error: feePolicyApiErrorCode(createJson.error, createRes.status),
        status: createRes.status,
      };
    }
    return { ok: true };
  }

  // Immediate: update existing or create.
  if (policyId) {
    const res = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(policyId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        starts_at: null,
        ends_at: null,
        is_active: true,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!json.ok) {
      return { ok: false, error: feePolicyApiErrorCode(json.error, res.status), status: res.status };
    }
    return { ok: true };
  }

  const res = await fetch("/api/admin/store-fee-policies", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      starts_at: null,
      ends_at: null,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!json.ok) {
    return { ok: false, error: feePolicyApiErrorCode(json.error, res.status), status: res.status };
  }
  return { ok: true };
}

export function AdminStoreFeePoliciesPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("industry");

  const [industryLevel, setIndustryLevel] = useState<IndustryLevel>("category");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const [storeQuery, setStoreQuery] = useState("");
  const [storeCatFilter, setStoreCatFilter] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const [verifyMismatchOnly, setVerifyMismatchOnly] = useState(true);
  const [verifyStoreQuery, setVerifyStoreQuery] = useState("");

  const [applyTarget, setApplyTarget] = useState<ApplyTarget | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feePercent, setFeePercent] = useState("");
  const [fixedFee, setFixedFee] = useState("0");
  const [timing, setTiming] = useState<Timing>("now");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [memo, setMemo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const oRes = await fetch("/api/admin/store-fee-policies/overview", { credentials: "include" });
      const oJson = (await oRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      } & Partial<Overview>;
      if (!oJson.ok) {
        setOverview(null);
        setError(feePolicyApiErrorCode(oJson.error, oRes.status));
        return;
      }
      setOverview({
        summary: {
          stores_total: oJson.summary?.stores_total ?? 0,
          applied_default: oJson.summary?.applied_default ?? 0,
          applied_category: oJson.summary?.applied_category ?? 0,
          applied_topic: oJson.summary?.applied_topic ?? 0,
          applied_business: oJson.summary?.applied_business ?? 0,
          applied_store: oJson.summary?.applied_store ?? 0,
          missing_policy: oJson.summary?.missing_policy ?? 0,
          reserved_future: oJson.summary?.reserved_future ?? 0,
          verification_mismatch: oJson.summary?.verification_mismatch ?? 0,
        },
        platform_default: oJson.platform_default ?? null,
        categories: oJson.categories ?? [],
        topics: oJson.topics ?? [],
        stores: oJson.stores ?? [],
        scheduled_changes: oJson.scheduled_changes ?? [],
        policy_history: oJson.policy_history ?? [],
        verification: oJson.verification ?? [],
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

  const openApply = useCallback(
    (
      target: ApplyTarget,
      seed?: { fee_percent?: number | null; fixed_fee?: number | null }
    ) => {
      setApplyTarget(target);
      setConfirmOpen(false);
      const pct = seed?.fee_percent;
      const fixed = seed?.fixed_fee;
      setFeePercent(pct != null && Number.isFinite(Number(pct)) ? String(pct) : "");
      setFixedFee(fixed != null && Number.isFinite(Number(fixed)) ? String(Math.round(Number(fixed))) : "0");
      setTiming("now");
      setStartsAt("");
      setEndsAt("");
      setMemo("");
      setError(null);
    },
    []
  );

  const closeApply = useCallback(() => {
    if (busy) return;
    setApplyTarget(null);
    setConfirmOpen(false);
  }, [busy]);

  const submitApply = useCallback(async () => {
    if (!applyTarget) return;
    const pct = Number(feePercent);
    if (!Number.isFinite(pct)) return;
    if (timing === "schedule" && !startsAt.trim()) {
      setError("invalid_window");
      return;
    }
    const fixed = Math.max(0, Math.round(Number(fixedFee) || 0));
    const startsAtIso = timing === "schedule" ? dateInputToIsoRangeStart(startsAt) : null;
    const endsAtIso = timing === "schedule" ? dateInputToIsoRangeEnd(endsAt) : null;
    if (timing === "schedule" && !startsAtIso) {
      setError("invalid_window");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const targets: Array<{
        kind: "default" | "category" | "topic" | "store";
        name: string;
        policyId: string | null;
        storeId?: string;
        categoryId?: string;
        topicId?: string;
      }> =
        applyTarget.kind === "stores_bulk"
          ? applyTarget.stores.map((s) => ({
              kind: "store" as const,
              name: s.name,
              policyId: s.policyId,
              storeId: s.storeId,
            }))
          : [
              applyTarget.kind === "default"
                ? { kind: "default", name: "Platform Default", policyId: applyTarget.policyId }
                : applyTarget.kind === "category"
                  ? {
                      kind: "category",
                      name: applyTarget.name,
                      policyId: applyTarget.policyId,
                      categoryId: applyTarget.categoryId,
                    }
                  : applyTarget.kind === "topic"
                    ? {
                        kind: "topic",
                        name: applyTarget.name,
                        policyId: applyTarget.policyId,
                        topicId: applyTarget.topicId,
                      }
                    : {
                        kind: "store",
                        name: applyTarget.name,
                        policyId: applyTarget.policyId,
                        storeId: applyTarget.storeId,
                      },
            ];

      for (const item of targets) {
        const body: Record<string, unknown> = {
          policy_name: item.name.slice(0, 80),
          fee_percent: pct,
          fixed_fee: fixed,
          is_active: true,
          priority: scopePriority(item.kind),
          memo: memo.trim() ? memo.trim().slice(0, 1000) : null,
          store_id: item.storeId ?? null,
          category_id: item.categoryId ?? null,
          topic_id: item.topicId ?? null,
        };
        // New rows need delivery defaults; PATCH must not wipe existing delivery_fee_*.
        if (!item.policyId || timing === "schedule") {
          body.delivery_fee_mode = "none";
          body.delivery_fee_percent = 0;
        }
        const result = await upsertPolicy({
          policyId: item.policyId,
          body,
          timing,
          startsAtIso,
          endsAtIso,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      setApplyTarget(null);
      setConfirmOpen(false);
      setSelectedStoreIds([]);
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }, [applyTarget, feePercent, fixedFee, load, memo, startsAt, endsAt, timing]);

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

  const selectedCategory = useMemo(
    () => overview?.categories.find((c) => c.category_id === selectedCategoryId) ?? null,
    [overview?.categories, selectedCategoryId]
  );
  const selectedTopic = useMemo(
    () => overview?.topics.find((tp) => tp.topic_id === selectedTopicId) ?? null,
    [overview?.topics, selectedTopicId]
  );

  const filteredStores = useMemo(() => {
    let list = overview?.stores ?? [];
    if (storeCatFilter) list = list.filter((s) => s.category_id === storeCatFilter);
    const q = storeQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.store_name.toLowerCase().includes(q) ||
        (s.slug ?? "").toLowerCase().includes(q) ||
        (s.category_name ?? "").toLowerCase().includes(q) ||
        (s.topic_name ?? "").toLowerCase().includes(q)
    );
  }, [overview?.stores, storeCatFilter, storeQuery]);

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

  const applyPct = Number(feePercent);
  const applyFixed = Math.max(0, Math.round(Number(fixedFee) || 0));
  const applyRateValid = Number.isFinite(applyPct) && feePercent.trim() !== "";
  const previewGross = 1000;
  const previewAmount = applyRateValid ? previewFee(previewGross, applyPct, applyFixed) : null;

  const tabs: Array<{ id: TabId; label: MessageKey }> = [
    { id: "industry", label: "admin_stores_fee_tab_apply_industry" },
    { id: "stores", label: "admin_stores_fee_tab_apply_stores" },
    { id: "verify", label: "admin_stores_fee_tab_verify" },
    { id: "history", label: "admin_stores_fee_tab_history" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <AdminPageHeader titleKey="admin_page_store_fee_policies" />
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_stores_fee_desc")}</p>
        </div>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void load()}
          className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {t("admin_stores_fee_refresh")}
        </button>
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
          <section className={`${panelClass()} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_platform_rate")}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-sam-fg">
                {overview.platform_default
                  ? fmtRate(overview.platform_default.fee_percent, overview.platform_default.fixed_fee)
                  : t("admin_stores_fee_platform_missing")}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              onClick={() =>
                openApply(
                  { kind: "default", policyId: overview.platform_default?.id ?? null },
                  overview.platform_default
                    ? {
                        fee_percent: overview.platform_default.fee_percent,
                        fixed_fee: overview.platform_default.fixed_fee,
                      }
                    : undefined
                )
              }
            >
              {t("admin_stores_fee_platform_edit")}
            </button>
          </section>

          <p className="sam-text-helper text-sam-muted">
            {t("admin_stores_fee_count_plain", {
              total: overview.summary.stores_total,
              biz: overview.summary.applied_business,
              store: overview.summary.applied_store,
              def: overview.summary.applied_default,
              miss: overview.summary.missing_policy,
              sched: overview.summary.reserved_future,
            })}
          </p>
          <p className="sam-text-xxs text-sam-muted">{t("admin_stores_fee_immediate_apply_note")}</p>

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

          {tab === "industry" ? (
            <IndustryApplyTab
              t={t}
              busy={busy}
              overview={overview}
              industryLevel={industryLevel}
              selectedCategoryId={selectedCategoryId}
              selectedTopicId={selectedTopicId}
              selectedCategory={selectedCategory}
              selectedTopic={selectedTopic}
              onLevel={setIndustryLevel}
              onSelectCategory={(id) => {
                setSelectedCategoryId(id);
                setSelectedTopicId(null);
              }}
              onSelectTopic={(id, catId) => {
                setSelectedTopicId(id);
                setSelectedCategoryId(catId);
              }}
              onApplyCategory={() => {
                if (!selectedCategory) return;
                openApply(
                  {
                    kind: "category",
                    categoryId: selectedCategory.category_id,
                    name: selectedCategory.name,
                    policyId: selectedCategory.policy?.id ?? null,
                  },
                  selectedCategory.policy
                    ? {
                        fee_percent: selectedCategory.policy.fee_percent,
                        fixed_fee: selectedCategory.policy.fixed_fee,
                      }
                    : overview.platform_default
                      ? {
                          fee_percent: overview.platform_default.fee_percent,
                          fixed_fee: overview.platform_default.fixed_fee,
                        }
                      : undefined
                );
              }}
              onApplyTopic={() => {
                if (!selectedTopic || !selectedCategory) return;
                const seed =
                  selectedTopic.policy ?? selectedCategory.policy ?? overview.platform_default;
                openApply(
                  {
                    kind: "topic",
                    topicId: selectedTopic.topic_id,
                    name: `${selectedCategory.name} > ${selectedTopic.name}`,
                    policyId: selectedTopic.policy?.id ?? null,
                  },
                  seed
                    ? { fee_percent: seed.fee_percent, fixed_fee: seed.fixed_fee }
                    : undefined
                );
              }}
              onDeactivate={(id) => void deactivate(id)}
            />
          ) : null}

          {tab === "stores" ? (
            <StoresApplyTab
              t={t}
              busy={busy}
              overview={overview}
              storeQuery={storeQuery}
              storeCatFilter={storeCatFilter}
              filteredStores={filteredStores}
              selectedStoreIds={selectedStoreIds}
              onStoreQuery={setStoreQuery}
              onStoreCatFilter={setStoreCatFilter}
              onToggleStore={(id) => {
                setSelectedStoreIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                );
              }}
              onToggleAllFiltered={() => {
                const ids = filteredStores.map((s) => s.store_id);
                const allOn = ids.length > 0 && ids.every((id) => selectedStoreIds.includes(id));
                setSelectedStoreIds(allOn ? selectedStoreIds.filter((id) => !ids.includes(id)) : [
                  ...new Set([...selectedStoreIds, ...ids]),
                ]);
              }}
              onApplyOne={(s) =>
                openApply(
                  {
                    kind: "store",
                    storeId: s.store_id,
                    name: s.store_name,
                    policyId: s.ladder.store.policy_id,
                  },
                  {
                    fee_percent: s.ladder.store.fee_percent ?? s.effective.fee_percent,
                    fixed_fee: s.ladder.store.fixed_fee ?? s.effective.fixed_fee,
                  }
                )
              }
              onApplyBulk={() => {
                const stores = (overview.stores ?? []).filter((s) =>
                  selectedStoreIds.includes(s.store_id)
                );
                if (stores.length === 0) return;
                openApply(
                  {
                    kind: "stores_bulk",
                    stores: stores.map((s) => ({
                      storeId: s.store_id,
                      name: s.store_name,
                      policyId: s.ladder.store.policy_id,
                    })),
                  },
                  overview.platform_default
                    ? {
                        fee_percent: overview.platform_default.fee_percent,
                        fixed_fee: overview.platform_default.fixed_fee,
                      }
                    : undefined
                );
              }}
              onClearOverride={(id) => void deactivate(id)}
            />
          ) : null}

          {tab === "verify" ? (
            <VerifyTab
              t={t}
              rows={filteredVerification}
              mismatchOnly={verifyMismatchOnly}
              storeQuery={verifyStoreQuery}
              mismatchCount={overview.summary.verification_mismatch}
              sampleN={overview.verification.length}
              onMismatchOnly={setVerifyMismatchOnly}
              onStoreQuery={setVerifyStoreQuery}
            />
          ) : null}

          {tab === "history" ? (
            <HistoryTab overview={overview} t={t} />
          ) : null}

          <p className="sam-text-xxs text-sam-muted">{t("admin_stores_fee_settlement_note")}</p>
          <p className="sam-text-xxs text-sam-muted">{t("admin_stores_fee_footer_formula")}</p>
        </>
      ) : null}

      {applyTarget ? (
        <ApplyModal
          t={t}
          busy={busy}
          applyTarget={applyTarget}
          feePercent={feePercent}
          fixedFee={fixedFee}
          timing={timing}
          startsAt={startsAt}
          endsAt={endsAt}
          memo={memo}
          applyRateValid={applyRateValid}
          previewGross={previewGross}
          previewAmount={previewAmount}
          confirmOpen={confirmOpen}
          onFeePercent={setFeePercent}
          onFixedFee={setFixedFee}
          onTiming={setTiming}
          onStartsAt={setStartsAt}
          onEndsAt={setEndsAt}
          onMemo={setMemo}
          onClose={closeApply}
          onRequestConfirm={() => setConfirmOpen(true)}
          onCancelConfirm={() => setConfirmOpen(false)}
          onSubmit={() => void submitApply()}
        />
      ) : null}
    </div>
  );
}

function IndustryApplyTab({
  t,
  busy,
  overview,
  industryLevel,
  selectedCategoryId,
  selectedTopicId,
  selectedCategory,
  selectedTopic,
  onLevel,
  onSelectCategory,
  onSelectTopic,
  onApplyCategory,
  onApplyTopic,
  onDeactivate,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  overview: Overview;
  industryLevel: IndustryLevel;
  selectedCategoryId: string | null;
  selectedTopicId: string | null;
  selectedCategory: OverviewCategory | null;
  selectedTopic: OverviewTopic | null;
  onLevel: (v: IndustryLevel) => void;
  onSelectCategory: (id: string) => void;
  onSelectTopic: (topicId: string, categoryId: string) => void;
  onApplyCategory: () => void;
  onApplyTopic: () => void;
  onDeactivate: (id: string) => void;
}) {
  const platform = overview.platform_default;
  const childTopics = selectedCategory
    ? overview.topics.filter((tp) => tp.category_id === selectedCategory.category_id)
    : [];

  const active =
    industryLevel === "category"
      ? selectedCategory
      : selectedTopic;

  const currentRate =
    industryLevel === "category"
      ? selectedCategory?.policy
        ? fmtRate(selectedCategory.policy.fee_percent, selectedCategory.policy.fixed_fee)
        : platform
          ? `${t("admin_stores_fee_inherit_parent")} (${fmtRate(platform.fee_percent, platform.fixed_fee)})`
          : t("admin_stores_fee_inherit_parent")
      : selectedTopic?.policy
        ? fmtRate(selectedTopic.policy.fee_percent, selectedTopic.policy.fixed_fee)
        : selectedCategory?.policy
          ? `${t("admin_stores_fee_inherit_parent")} (${fmtRate(selectedCategory.policy.fee_percent, selectedCategory.policy.fixed_fee)})`
          : platform
            ? `${t("admin_stores_fee_inherit_parent")} (${fmtRate(platform.fee_percent, platform.fixed_fee)})`
            : t("admin_stores_fee_inherit_parent");

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className={panelClass()}>
        <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_select_target")}</h2>
        <fieldset className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="industry-level"
              checked={industryLevel === "category"}
              onChange={() => onLevel("category")}
            />
            {t("admin_stores_fee_level_primary")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="industry-level"
              checked={industryLevel === "topic"}
              onChange={() => onLevel("topic")}
            />
            {t("admin_stores_fee_level_secondary")}
          </label>
        </fieldset>

        {industryLevel === "category" ? (
          <ul className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
            {overview.categories.map((cat) => (
              <li key={cat.category_id}>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-ui-rect border px-3 py-2 text-sm ${
                    selectedCategoryId === cat.category_id
                      ? "border-sam-ink bg-sam-app"
                      : "border-sam-border-soft"
                  }`}
                >
                  <input
                    type="radio"
                    name="industry-category"
                    className="mt-1"
                    checked={selectedCategoryId === cat.category_id}
                    onChange={() => onSelectCategory(cat.category_id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-sam-fg">{cat.name}</span>
                    <span className="mt-0.5 block tabular-nums text-sam-muted">
                      {cat.policy
                        ? fmtRate(cat.policy.fee_percent, cat.policy.fixed_fee)
                        : t("admin_stores_fee_inherit_parent")}{" "}
                      · {t("admin_stores_fee_kpi_count_stores", { count: cat.store_count })}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              <span className="text-sam-muted">{t("admin_stores_fee_level_primary")}</span>
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                value={selectedCategoryId ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) onSelectCategory(id);
                }}
              >
                <option value="">{t("admin_stores_fee_select_primary_first")}</option>
                {overview.categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <ul className="max-h-[22rem] space-y-1 overflow-y-auto">
              {childTopics.map((tp) => (
                <li key={tp.topic_id}>
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-ui-rect border px-3 py-2 text-sm ${
                      selectedTopicId === tp.topic_id
                        ? "border-sam-ink bg-sam-app"
                        : "border-sam-border-soft"
                    }`}
                  >
                    <input
                      type="radio"
                      name="industry-topic"
                      className="mt-1"
                      checked={selectedTopicId === tp.topic_id}
                      onChange={() => onSelectTopic(tp.topic_id, tp.category_id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-sam-fg">{tp.name}</span>
                      <span className="mt-0.5 block tabular-nums text-sam-muted">
                        {tp.policy
                          ? fmtRate(tp.policy.fee_percent, tp.policy.fixed_fee)
                          : t("admin_stores_fee_inherit_parent")}{" "}
                        · {t("admin_stores_fee_kpi_count_stores", { count: tp.store_count })}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {selectedCategory && childTopics.length === 0 ? (
                <p className="text-sm text-sam-muted">{t("admin_stores_fee_no_topics")}</p>
              ) : null}
            </ul>
          </div>
        )}
      </div>

      <div className={panelClass()}>
        <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_apply_panel_title")}</h2>
        {!active ? (
          <p className="mt-3 text-sm text-sam-muted">{t("admin_stores_fee_select_target_hint")}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_apply_target")}</p>
              <p className="font-medium text-sam-fg">
                {industryLevel === "category"
                  ? `${t("admin_stores_fee_level_primary")}: ${selectedCategory?.name}`
                  : `${t("admin_stores_fee_level_secondary")}: ${selectedCategory?.name} > ${selectedTopic?.name}`}
              </p>
            </div>
            <div>
              <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_current_rate")}</p>
              <p className="text-lg font-semibold tabular-nums text-sam-fg">{currentRate}</p>
            </div>
            <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-xxs text-sam-muted">
              <p>{t("admin_stores_fee_apply_semantics")}</p>
              {industryLevel === "category" && selectedCategory ? (
                <p className="mt-1">
                  {t("admin_stores_fee_impact_would", { n: selectedCategory.would_apply_store_count })} ·{" "}
                  {t("admin_stores_fee_impact_override", { n: selectedCategory.override_store_count })} ·{" "}
                  {t("admin_stores_fee_impact_topic", { n: selectedCategory.topic_wins_store_count })}
                </p>
              ) : null}
              {industryLevel === "topic" && selectedTopic ? (
                <p className="mt-1">
                  {t("admin_stores_fee_impact_would", { n: selectedTopic.would_apply_store_count })} ·{" "}
                  {t("admin_stores_fee_impact_override", { n: selectedTopic.override_store_count })}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                onClick={industryLevel === "category" ? onApplyCategory : onApplyTopic}
              >
                {t("admin_stores_fee_bulk_apply_open")}
              </button>
              {industryLevel === "category" && selectedCategory?.policy ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-sam-border px-3 py-2 text-sm disabled:opacity-40"
                  onClick={() => onDeactivate(selectedCategory.policy!.id)}
                >
                  {t("admin_stores_fee_deactivate")}
                </button>
              ) : null}
              {industryLevel === "topic" && selectedTopic?.policy ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-sam-border px-3 py-2 text-sm disabled:opacity-40"
                  onClick={() => onDeactivate(selectedTopic.policy!.id)}
                >
                  {t("admin_stores_fee_deactivate")}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StoresApplyTab({
  t,
  busy,
  overview,
  storeQuery,
  storeCatFilter,
  filteredStores,
  selectedStoreIds,
  onStoreQuery,
  onStoreCatFilter,
  onToggleStore,
  onToggleAllFiltered,
  onApplyOne,
  onApplyBulk,
  onClearOverride,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  overview: Overview;
  storeQuery: string;
  storeCatFilter: string;
  filteredStores: OverviewStore[];
  selectedStoreIds: string[];
  onStoreQuery: (v: string) => void;
  onStoreCatFilter: (v: string) => void;
  onToggleStore: (id: string) => void;
  onToggleAllFiltered: () => void;
  onApplyOne: (s: OverviewStore) => void;
  onApplyBulk: () => void;
  onClearOverride: (policyId: string) => void;
}) {
  const allFilteredSelected =
    filteredStores.length > 0 &&
    filteredStores.every((s) => selectedStoreIds.includes(s.store_id));

  return (
    <section className={panelClass()}>
      <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_stores_title")}</h2>
      <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_fee_stores_bulk_help")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          className="rounded border border-sam-border px-2 py-1.5 text-sm"
          value={storeCatFilter}
          onChange={(e) => onStoreCatFilter(e.target.value)}
        >
          <option value="">{t("admin_stores_fee_filter_all")}</option>
          {overview.categories.map((c) => (
            <option key={c.category_id} value={c.category_id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="min-w-[12rem] flex-1 rounded border border-sam-border px-2 py-1.5 text-sm"
          placeholder={t("admin_stores_fee_search_store_list")}
          value={storeQuery}
          onChange={(e) => onStoreQuery(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || selectedStoreIds.length === 0}
          className="rounded bg-sam-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          onClick={onApplyBulk}
        >
          {t("admin_stores_fee_bulk_apply", { n: selectedStoreIds.length })}
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[920px] w-full text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={onToggleAllFiltered}
                  aria-label={t("admin_stores_fee_bulk_select_all")}
                />
              </th>
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
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedStoreIds.includes(s.store_id)}
                    onChange={() => onToggleStore(s.store_id)}
                  />
                </td>
                <td className="px-3 py-2 font-medium text-sam-fg">{s.store_name}</td>
                <td className="px-3 py-2 text-sam-muted">
                  {[s.category_name, s.topic_name].filter(Boolean).join(" > ") || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums font-medium">
                  {s.effective.missing
                    ? t("admin_stores_fee_reason_missing")
                    : fmtRate(s.effective.fee_percent, s.effective.fixed_fee)}
                </td>
                <td className="px-3 py-2 text-sam-muted">{t(reasonKey(s.effective.scope))}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-sm underline disabled:opacity-40"
                    onClick={() => onApplyOne(s)}
                  >
                    {t("admin_stores_fee_set_rate")}
                  </button>
                  {s.has_store_override && s.ladder.store.policy_id ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="ml-2 text-sm text-sam-muted underline disabled:opacity-40"
                      onClick={() => onClearOverride(s.ladder.store.policy_id!)}
                    >
                      {t("admin_stores_fee_clear_override")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VerifyTab({
  t,
  rows,
  mismatchOnly,
  storeQuery,
  mismatchCount,
  sampleN,
  onMismatchOnly,
  onStoreQuery,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  rows: VerifyRow[];
  mismatchOnly: boolean;
  storeQuery: string;
  mismatchCount: number;
  sampleN: number;
  onMismatchOnly: (v: boolean) => void;
  onStoreQuery: (v: string) => void;
}) {
  return (
    <section className={panelClass()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_verify_title")}</h2>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_stores_fee_verify_sample_n", { n: sampleN })}
            {mismatchCount > 0
              ? ` · ${t("admin_stores_fee_verify_mismatch_count", { count: mismatchCount })}`
              : ""}
          </p>
          <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_stores_fee_settlement_note")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mismatchOnly}
            onChange={(e) => onMismatchOnly(e.target.checked)}
          />
          {t("admin_stores_fee_verify_mismatch_only")}
        </label>
      </div>
      <input
        className="mt-3 w-full max-w-md rounded border border-sam-border px-2 py-1.5 text-sm"
        placeholder={t("admin_stores_fee_search_store_list")}
        value={storeQuery}
        onChange={(e) => onStoreQuery(e.target.value)}
      />
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-sam-muted">{t("admin_stores_fee_verify_empty")}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[980px] w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_stores_fee_th_store")}</th>
                <th className="px-3 py-2">{t("admin_stores_settlements_th_order_id")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_policy")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_calc")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_settlement")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_verify_result")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.settlement_id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2">{r.store_name}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.order_id_short}
                    <span className="mt-0.5 block text-sam-muted">{fmtMoney(r.gross_amount)}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {fmtRate(r.policy_fee_percent, r.policy_fixed_fee ?? 0)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtMoney(r.calculated_fee_amount)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {fmtRate(r.settlement_fee_percent, r.settlement_fixed_fee ?? 0)}
                    <span className="mt-0.5 block">{fmtMoney(r.settlement_fee_amount)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.matched ? (
                      <span className="text-emerald-700">{t("admin_stores_fee_verify_match")}</span>
                    ) : (
                      <span className="text-red-700">{t("admin_stores_fee_verify_mismatch")}</span>
                    )}
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

function HistoryTab({
  overview,
  t,
}: {
  overview: Overview;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={panelClass()}>
        <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_section_scheduled")}</h2>
        {overview.scheduled_changes.length === 0 ? (
          <p className="mt-3 text-sm text-sam-muted">{t("admin_stores_fee_schedule_empty")}</p>
        ) : (
          <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
            {overview.scheduled_changes.map((row) => (
              <li
                key={row.id}
                className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 text-sm"
              >
                <p className="font-medium text-sam-fg">{row.target_label}</p>
                <p className="mt-0.5 tabular-nums text-sam-muted">
                  {fmtRate(row.fee_percent, row.fixed_fee)} · {fmtDate(row.starts_at)}
                  {row.ends_at ? ` → ${fmtDate(row.ends_at)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={panelClass()}>
        <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_fee_section_history")}</h2>
        <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_stores_fee_history_actor_na")}</p>
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {overview.policy_history.map((row) => (
            <li
              key={row.id}
              className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 text-sm"
            >
              <p className="font-medium text-sam-fg">{row.target_label}</p>
              <p className="mt-0.5 tabular-nums text-sam-muted">
                {fmtRate(row.fee_percent, row.fixed_fee)}
                {!row.is_active || row.is_archived ? ` · ${t("admin_stores_fee_status_off")}` : ""}
              </p>
              <p className="mt-0.5 text-sam-muted">{fmtDate(row.updated_at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ApplyModal({
  t,
  busy,
  applyTarget,
  feePercent,
  fixedFee,
  timing,
  startsAt,
  endsAt,
  memo,
  applyRateValid,
  previewGross,
  previewAmount,
  confirmOpen,
  onFeePercent,
  onFixedFee,
  onTiming,
  onStartsAt,
  onEndsAt,
  onMemo,
  onClose,
  onRequestConfirm,
  onCancelConfirm,
  onSubmit,
}: {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  busy: boolean;
  applyTarget: ApplyTarget;
  feePercent: string;
  fixedFee: string;
  timing: Timing;
  startsAt: string;
  endsAt: string;
  memo: string;
  applyRateValid: boolean;
  previewGross: number;
  previewAmount: number | null;
  confirmOpen: boolean;
  onFeePercent: (v: string) => void;
  onFixedFee: (v: string) => void;
  onTiming: (v: Timing) => void;
  onStartsAt: (v: string) => void;
  onEndsAt: (v: string) => void;
  onMemo: (v: string) => void;
  onClose: () => void;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  onSubmit: () => void;
}) {
  const targetLabel =
    applyTarget.kind === "default"
      ? t("admin_stores_fee_scope_default")
      : applyTarget.kind === "category"
        ? `${t("admin_stores_fee_level_primary")}: ${applyTarget.name}`
        : applyTarget.kind === "topic"
          ? `${t("admin_stores_fee_level_secondary")}: ${applyTarget.name}`
          : applyTarget.kind === "stores_bulk"
            ? t("admin_stores_fee_bulk_selected", { n: applyTarget.stores.length })
            : `${t("admin_stores_fee_scope_store")}: ${applyTarget.name}`;

  const rateLabel = applyRateValid
    ? fmtRate(Number(feePercent), Math.round(Number(fixedFee) || 0))
    : "—";
  const whenLabel =
    timing === "now"
      ? t("admin_stores_fee_when_now")
      : t("admin_stores_fee_when_schedule", { date: startsAt || "—" });

  return (
    <DibayOverlayRoot open onClose={onClose} dismissible={!busy} placement="center" zRole="dialog">
      <div
        className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={OverlayUi.title}>
          {confirmOpen ? t("admin_stores_fee_confirm_apply") : t("admin_stores_fee_apply_title")}
        </h2>
        <div className={`${OverlayUi.body} mt-3 space-y-3`}>
          {confirmOpen ? (
            <div className="space-y-2 text-sm">
              <p>{t("admin_stores_fee_confirm_body", { target: targetLabel, rate: rateLabel, when: whenLabel })}</p>
              <p className="tabular-nums text-sam-muted">
                {t("admin_stores_fee_rate_formula_preview", {
                  gross: previewGross.toLocaleString(),
                  fee: previewAmount != null ? previewAmount.toLocaleString() : "—",
                })}
              </p>
              <p className="sam-text-xxs text-sam-muted">{t("admin_stores_fee_settlement_note")}</p>
              {timing === "now" ? (
                <p className="sam-text-xxs text-sam-muted">{t("admin_stores_fee_immediate_apply_note")}</p>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                <p className={OverlayUi.caption}>{t("admin_stores_fee_apply_target")}</p>
                <p className="text-sm text-sam-fg">{targetLabel}</p>
              </div>
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
                <span className={OverlayUi.caption}>{t("admin_stores_fee_fixed_php")}</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
                    value={fixedFee}
                    onChange={(e) => onFixedFee(e.target.value)}
                    inputMode="numeric"
                  />
                  <span className="text-sm text-sam-muted">PHP</span>
                </div>
              </label>
              {applyRateValid ? (
                <p className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 text-sm tabular-nums">
                  {t("admin_stores_fee_new_rate")}: <strong>{rateLabel}</strong>
                  <span className="mt-1 block sam-text-xxs text-sam-muted">
                    {t("admin_stores_fee_rate_formula_preview", {
                      gross: previewGross.toLocaleString(),
                      fee: String(previewAmount ?? "—"),
                    })}
                  </span>
                </p>
              ) : null}
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
                    <label className="text-sm">
                      <span className="text-sam-muted">{t("admin_stores_fee_schedule_start")}</span>
                      <input
                        type="date"
                        className="mt-1 block rounded border border-sam-border px-2 py-1.5 text-sm"
                        value={startsAt}
                        onChange={(e) => onStartsAt(e.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-sam-muted">{t("admin_stores_fee_schedule_end")}</span>
                      <input
                        type="date"
                        className="mt-1 block rounded border border-sam-border px-2 py-1.5 text-sm"
                        value={endsAt}
                        onChange={(e) => onEndsAt(e.target.value)}
                      />
                    </label>
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
            </>
          )}
        </div>
        <div className={`${OverlayUi.actionsRow} mt-4`}>
          {confirmOpen ? (
            <>
              <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={onCancelConfirm}>
                {t("admin_stores_fee_apply_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton roleTone="primary" disabled={busy} onClick={onSubmit}>
                {t("admin_stores_fee_apply_submit")}
              </DibayOverlayButton>
            </>
          ) : (
            <>
              <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={onClose}>
                {t("admin_stores_fee_apply_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="primary"
                disabled={
                  busy ||
                  !applyRateValid ||
                  (timing === "schedule" && !startsAt.trim())
                }
                onClick={onRequestConfirm}
              >
                {t("admin_stores_fee_confirm_apply")}
              </DibayOverlayButton>
            </>
          )}
        </div>
      </div>
    </DibayOverlayRoot>
  );
}
