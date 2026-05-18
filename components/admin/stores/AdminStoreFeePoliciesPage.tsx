"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";

type Row = {
  id: string;
  policy_name: string;
  store_id: string | null;
  category_id: string | null;
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
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  created_at?: string;
};

type StoreRow = { id: string; store_name?: string | null; slug?: string | null };
type CategoryRow = { id: string; name: string; slug: string; is_active: boolean };

function fmtMoney(n: number) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString("en-PH")} PHP`;
}

function fmtPercent(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  return `${v.toFixed(2)}%`;
}

function scopeLabelKey(r: Row): MessageKey {
  if (r.store_id) return "admin_stores_fee_scope_store";
  if (r.category_id) return "admin_stores_fee_scope_category";
  return "admin_stores_fee_scope_default";
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

function formatArchivedBy(id: string | null | undefined): string {
  const s = typeof id === "string" ? id.trim() : "";
  return s || "—";
}

function targetScopeDescription(
  r: Row,
  stores: StoreRow[],
  categories: CategoryRow[],
  t: (key: MessageKey, params?: Record<string, string | number>) => string
): string {
  if (r.store_id) {
    const s = stores.find((x) => x.id === r.store_id);
    const tail = s
      ? `${String(s.store_name ?? t("common_store"))}${s.slug ? ` /${s.slug}` : ""}`
      : r.store_id;
    if (r.category_id) {
      const c = categories.find((x) => x.id === r.category_id);
      const ct = c ? `${c.name} (${c.slug})` : r.category_id;
      return t("admin_stores_fee_scope_store_pivot", { tail, category: ct });
    }
    return t("admin_stores_fee_scope_store_label", { tail });
  }
  if (r.category_id) {
    const c = categories.find((x) => x.id === r.category_id);
    return c
      ? t("admin_stores_fee_scope_category_label", { name: `${c.name} (${c.slug})` })
      : t("admin_stores_fee_scope_category_label", { name: r.category_id });
  }
  return t("admin_stores_fee_scope_global");
}

function feeSummary(r: Row): string {
  return `${fmtPercent(r.fee_percent)} + ${fmtMoney(r.fixed_fee)}`;
}

function isoToDateInput(iso: string | null | undefined): string {
  const s = typeof iso === "string" ? iso.trim() : "";
  return s ? s.slice(0, 10) : "";
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

export function AdminStoreFeePoliciesPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [archiveModalRow, setArchiveModalRow] = useState<Row | null>(null);
  const [archiveReasonDraft, setArchiveReasonDraft] = useState("");
  const [archiveModalError, setArchiveModalError] = useState<string | null>(null);

  const [restoreModalRow, setRestoreModalRow] = useState<Row | null>(null);
  const [restoreModalError, setRestoreModalError] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [policyType, setPolicyType] = useState<"default" | "category" | "store">("default");
  const [name, setName] = useState("");
  const [feePercent, setFeePercent] = useState("12");
  const [fixedFee, setFixedFee] = useState("0");
  const [deliveryMode, setDeliveryMode] = useState<"none" | "percent">("none");
  const [deliveryPercent, setDeliveryPercent] = useState("0");
  const [priority, setPriority] = useState("100");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [memo, setMemo] = useState("");

  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("active_only", "0");
      if (includeArchived) qs.set("include_archived", "1");
      const res = await fetch(`/api/admin/store-fee-policies?${qs.toString()}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; policies?: Row[] };
      if (!json.ok) {
        setRows([]);
        setError(feePolicyApiErrorCode(json.error, res.status));
        return;
      }
      setRows(Array.isArray(json.policies) ? json.policies : []);
    } catch {
      setRows([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  const loadRefs = useCallback(async () => {
    setRefLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch("/api/admin/stores?status=all", { credentials: "include" }),
        fetch("/api/admin/stores/taxonomy", { credentials: "include" }),
      ]);
      const sJson = (await sRes.json().catch(() => ({}))) as { ok?: boolean; stores?: any[] };
      const tJson = (await tRes.json().catch(() => ({}))) as { ok?: boolean; categories?: any[] };
      setStores(
        Array.isArray(sJson.stores)
          ? sJson.stores.map((r) => ({
              id: String(r.id),
              store_name: (r.store_name ?? null) as any,
              slug: (r.slug ?? null) as any,
            }))
          : []
      );
      setCategories(
        Array.isArray(tJson.categories)
          ? tJson.categories.map((c) => ({
              id: String(c.id),
              name: String(c.name ?? ""),
              slug: String(c.slug ?? ""),
              is_active: Boolean(c.is_active),
            }))
          : []
      );
    } catch {
      // optional
    } finally {
      setRefLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  const effectiveDefaults = useMemo(() => {
    const base = rows.find((r) => r.is_active && !r.is_archived && !r.store_id && !r.category_id);
    return base ?? null;
  }, [rows]);

  const resetFormForCreate = useCallback(() => {
    setMode("create");
    setEditingId(null);
    setPolicyType("default");
    setName("");
    setFeePercent("12");
    setFixedFee("0");
    setDeliveryMode("none");
    setDeliveryPercent("0");
    setPriority("100");
    setStartsAt("");
    setEndsAt("");
    setIsActive(true);
    setMemo("");
    setStoreQuery("");
    setSelectedStoreId("");
    setCategoryQuery("");
    setSelectedCategoryId("");
  }, []);

  const startEdit = useCallback((r: Row) => {
    setMode("edit");
    setEditingId(r.id);
    setPolicyType(r.store_id ? "store" : r.category_id ? "category" : "default");
    setName(r.policy_name ?? "");
    setFeePercent(String(r.fee_percent ?? 0));
    setFixedFee(String(r.fixed_fee ?? 0));
    setDeliveryMode(r.delivery_fee_mode === "percent" ? "percent" : "none");
    setDeliveryPercent(String(r.delivery_fee_percent ?? 0));
    setPriority(String(r.priority ?? 100));
    setStartsAt(isoToDateInput(r.starts_at));
    setEndsAt(isoToDateInput(r.ends_at));
    setIsActive(Boolean(r.is_active));
    setMemo(typeof r.memo === "string" ? r.memo : "");
    setSelectedStoreId(r.store_id ?? "");
    setSelectedCategoryId(r.category_id ?? "");
  }, []);

  const storeOptions = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return stores.slice(0, 25);
    return stores
      .filter(
        (s) =>
          String(s.store_name ?? "").toLowerCase().includes(q) ||
          String(s.slug ?? "").toLowerCase().includes(q) ||
          String(s.id).includes(q)
      )
      .slice(0, 25);
  }, [storeQuery, stores]);

  const categoryOptions = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return categories.slice(0, 25);
    return categories
      .filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || c.id.includes(q))
      .slice(0, 25);
  }, [categories, categoryQuery]);

  const submit = useCallback(async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);

    const body: Record<string, unknown> = {
      policy_name: n,
      fee_percent: Number(feePercent),
      fixed_fee: Number(fixedFee),
      delivery_fee_mode: deliveryMode,
      delivery_fee_percent: Number(deliveryPercent),
      is_active: isActive,
      priority: Number(priority),
      starts_at: dateInputToIsoRangeStart(startsAt),
      ends_at: dateInputToIsoRangeEnd(endsAt),
      memo: memo.trim() ? memo.trim() : null,
    };

    if (policyType === "default") {
      body.store_id = null;
      body.category_id = null;
    } else if (policyType === "category") {
      body.store_id = null;
      body.category_id = selectedCategoryId || null;
    } else {
      body.store_id = selectedStoreId || null;
      body.category_id = selectedCategoryId || null;
    }

    try {
      const res =
        mode === "create"
          ? await fetch("/api/admin/store-fee-policies", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(editingId ?? "")}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(feePolicyApiErrorCode(json.error, res.status));
        return;
      }
      await load();
      resetFormForCreate();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }, [
    categoryOptions,
    deliveryMode,
    deliveryPercent,
    editingId,
    endsAt,
    feePercent,
    fixedFee,
    isActive,
    load,
    memo,
    mode,
    name,
    policyType,
    priority,
    resetFormForCreate,
    selectedCategoryId,
    selectedStoreId,
    startsAt,
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

  const anyModalOpen = archiveModalRow !== null || restoreModalRow !== null;

  const closeArchiveModal = useCallback((force?: boolean) => {
    if (!force && busy) return;
    setArchiveModalRow(null);
    setArchiveReasonDraft("");
    setArchiveModalError(null);
  }, [busy]);

  const closeRestoreModal = useCallback((force?: boolean) => {
    if (!force && busy) return;
    setRestoreModalRow(null);
    setRestoreModalError(null);
  }, [busy]);

  const confirmArchive = useCallback(async () => {
    const row = archiveModalRow;
    if (!row) return;
    setBusy(true);
    setArchiveModalError(null);
    setError(null);
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
      closeArchiveModal(true);
      await load();
    } catch {
      setArchiveModalError(feePolicyErrorMessage(t, "network_error"));
    } finally {
      setBusy(false);
    }
  }, [archiveModalRow, archiveReasonDraft, closeArchiveModal, load, t]);

  const confirmRestore = useCallback(async () => {
    const row = restoreModalRow;
    if (!row) return;
    setBusy(true);
    setRestoreModalError(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: false }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setRestoreModalError(feePolicyErrorMessage(t, feePolicyApiErrorCode(json.error, res.status)));
        return;
      }
      closeRestoreModal(true);
      await load();
    } catch {
      setRestoreModalError(feePolicyErrorMessage(t, "network_error"));
    } finally {
      setBusy(false);
    }
  }, [closeRestoreModal, load, restoreModalRow, t]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_fee_policies" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_fee_desc")}</p>

      {error ? (
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {feePolicyErrorMessage(t, error)}
        </p>
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-sam-fg">
          {mode === "create" ? t("admin_stores_fee_form_create") : t("admin_stores_fee_form_edit")}
        </h2>
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_stores_fee_form_hint")}
          {effectiveDefaults ? (
            <span className="ml-1 text-sam-muted">
              {t("admin_stores_fee_form_current_default", {
                name: effectiveDefaults.policy_name,
                percent: fmtPercent(effectiveDefaults.fee_percent),
                fixed: fmtMoney(effectiveDefaults.fixed_fee),
              })}
            </span>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="rounded border border-sam-border px-2 py-1.5 text-sm"
            value={policyType}
            onChange={(e) => setPolicyType(e.target.value as any)}
          >
            <option value="default">{t("admin_stores_fee_scope_default")}</option>
            <option value="category">{t("admin_stores_fee_scope_category")}</option>
            <option value="store">{t("admin_stores_fee_scope_store")}</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-sam-fg">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {t("common_active")}
          </label>
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
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="w-56 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder={t("admin_stores_fee_ph_name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder={t("admin_stores_fee_ph_percent")}
            value={feePercent}
            onChange={(e) => setFeePercent(e.target.value)}
            inputMode="decimal"
          />
          <input
            className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder={t("admin_stores_fee_ph_fixed")}
            value={fixedFee}
            onChange={(e) => setFixedFee(e.target.value)}
            inputMode="numeric"
          />
          <select
            className="rounded border border-sam-border px-2 py-1.5 text-sm"
            value={deliveryMode}
            onChange={(e) => setDeliveryMode(e.target.value as any)}
          >
            <option value="none">{t("admin_stores_fee_delivery_none")}</option>
            <option value="percent">{t("admin_stores_fee_delivery_percent")}</option>
          </select>
          {deliveryMode === "percent" ? (
            <input
              className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
              placeholder={t("admin_stores_fee_ph_delivery_percent")}
              value={deliveryPercent}
              onChange={(e) => setDeliveryPercent(e.target.value)}
              inputMode="decimal"
            />
          ) : null}
          <input
            className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            inputMode="numeric"
          />
          <button
            type="button"
            disabled={
              busy ||
              !name.trim() ||
              (policyType === "store" && !selectedStoreId) ||
              (policyType === "category" && !selectedCategoryId)
            }
            onClick={() => void submit()}
            className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {mode === "create" ? t("admin_stores_fee_create") : t("common_save")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded border border-sam-border px-3 py-2 text-sm font-medium text-sam-fg disabled:opacity-40"
          >
            {t("admin_stores_fee_refresh")}
          </button>
          {mode === "edit" ? (
            <button
              type="button"
              onClick={resetFormForCreate}
              className="rounded border border-sam-border px-3 py-2 text-sm font-medium text-sam-fg"
            >
              {t("admin_stores_fee_switch_create")}
            </button>
          ) : null}
        </div>

        {policyType === "store" ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_pick_store")}</p>
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                placeholder={t("admin_stores_fee_search_store")}
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
              />
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                disabled={refLoading}
              >
                <option value="">{t("admin_stores_fee_pick_optional")}</option>
                {storeOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.store_name ?? t("common_store"))} {s.slug ? `/${s.slug}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_category_optional")}</p>
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                placeholder={t("admin_stores_fee_search_category")}
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
              />
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                disabled={refLoading}
              >
                <option value="">{t("admin_stores_fee_pick_none")}</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {policyType === "category" ? (
          <div className="mt-3">
            <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_pick_category")}</p>
            <input
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
              placeholder={t("admin_stores_fee_search_category")}
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
            />
            <select
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              disabled={refLoading}
            >
              <option value="">{t("admin_stores_fee_pick_optional")}</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mt-3">
          <p className="sam-text-helper text-sam-muted">{t("admin_stores_fee_memo_label")}</p>
          <textarea
            className="mt-1 w-full rounded border border-sam-border px-2 py-2 text-sm"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={t("admin_stores_fee_memo_ph")}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-sam-fg">
          <input
            type="checkbox"
            checked={includeArchived}
            disabled={loading || busy}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          {t("admin_stores_fee_include_archived")}
        </label>
        <p className="sam-text-xxs text-sam-muted">{t("admin_stores_fee_archived_hint")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-sm text-sam-muted">
          {t("admin_stores_fee_empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <table className="min-w-[960px] w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_stores_fee_th_name")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_target")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_fee")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_delivery")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_period")}</th>
                <th className="px-3 py-2">priority</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_active")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_archive")}</th>
                <th className="px-3 py-2">{t("admin_stores_fee_th_memo")}</th>
                <th className="px-3 py-2">{t("admin_stores_settlements_th_action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-sam-border-soft ${r.is_archived ? "bg-slate-50 text-slate-600" : ""}`}
                >
                  <td className={`px-3 py-2 font-medium ${r.is_archived ? "text-slate-700" : "text-sam-fg"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{r.policy_name}</span>
                      {r.is_archived ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 sam-text-xxs font-medium text-slate-700">
                          {t("admin_stores_fee_archived_badge")}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {targetScopeDescription(r, stores, categories, t)}
                  </td>
                  <td className="px-3 py-2">
                    {fmtPercent(r.fee_percent)} + {fmtMoney(r.fixed_fee)}
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {r.delivery_fee_mode === "percent" ? fmtPercent(r.delivery_fee_percent) : "—"}
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {(r.starts_at ?? "").slice(0, 10) || "—"} ~ {(r.ends_at ?? "").slice(0, 10) || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-sam-muted">{r.priority}</td>
                  <td className="px-3 py-2">{r.is_active ? "ON" : "OFF"}</td>
                  <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                    {r.is_archived ? (
                      <div className="space-y-1.5">
                        <div>
                          <span className="text-slate-500">{t("admin_stores_fee_archived_at")}</span>{" "}
                          <span className="font-mono text-slate-700">
                            {(r.archived_at ?? "").slice(0, 19).replace("T", " ") || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">{t("admin_stores_fee_archived_by")}</span>{" "}
                          <span className="break-all font-mono text-slate-700">{formatArchivedBy(r.archived_by)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">{t("admin_stores_fee_archive_reason")}</span>{" "}
                          <span className="break-words text-slate-700">
                            {typeof r.archive_reason === "string" && r.archive_reason.trim()
                              ? r.archive_reason
                              : "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                    {typeof r.memo === "string" && r.memo.trim()
                      ? r.memo.length > 60
                        ? `${r.memo.slice(0, 60)}…`
                        : r.memo
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || anyModalOpen || Boolean(r.is_archived)}
                        className="rounded border border-sam-border px-2 py-1 sam-text-xxs text-sam-fg disabled:opacity-40"
                        onClick={() => startEdit(r)}
                      >
                        {t("common_edit")}
                      </button>
                      {r.is_active && !r.is_archived ? (
                        <button
                          type="button"
                          disabled={busy || anyModalOpen}
                          className="rounded border border-amber-300 px-2 py-1 sam-text-xxs text-amber-900 disabled:opacity-40"
                          onClick={() => void deactivate(r.id)}
                        >
                          {t("admin_stores_fee_deactivate")}
                        </button>
                      ) : null}
                      {!r.is_archived ? (
                        <button
                          type="button"
                          disabled={busy || anyModalOpen}
                          className="rounded border border-slate-400 px-2 py-1 sam-text-xxs text-slate-800 disabled:opacity-40"
                          onClick={() => {
                            setArchiveModalRow(r);
                            setArchiveReasonDraft("");
                            setArchiveModalError(null);
                          }}
                        >
                          {t("admin_stores_fee_archive")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || anyModalOpen}
                          className="rounded border border-emerald-400 px-2 py-1 sam-text-xxs text-emerald-900 disabled:opacity-40"
                          onClick={() => {
                            setRestoreModalRow(r);
                            setRestoreModalError(null);
                          }}
                        >
                          {t("admin_stores_fee_restore")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archiveModalRow ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) closeArchiveModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-policy-archive-title"
          >
            <h2 id="fee-policy-archive-title" className="text-base font-bold text-sam-fg">
              {t("admin_stores_fee_archive_modal_title")}
            </h2>
            <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_stores_fee_archive_modal_desc")}</p>
            <dl className="mt-4 space-y-2 sam-text-body-secondary">
              <div>
                <dt className="text-sam-muted">{t("admin_stores_fee_th_name")}</dt>
                <dd className="font-medium text-sam-fg">{archiveModalRow.policy_name}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_fee_th_target")}</dt>
                <dd>{targetScopeDescription(archiveModalRow, stores, categories, t)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_fee_th_fee")}</dt>
                <dd>{feeSummary(archiveModalRow)}</dd>
              </div>
            </dl>
            <label className="mt-4 block text-xs font-medium text-sam-muted">
              {t("admin_stores_fee_archive_reason_ph")}
            </label>
            <textarea
              value={archiveReasonDraft}
              onChange={(e) => setArchiveReasonDraft(e.target.value)}
              rows={4}
              disabled={busy}
              maxLength={2000}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm disabled:opacity-50"
              placeholder={t("admin_stores_fee_archive_reason_ph")}
            />
            {archiveModalError ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                {archiveModalError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => closeArchiveModal()}
                className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-medium text-sam-fg disabled:opacity-40"
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmArchive()}
                className="rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t("admin_stores_fee_archive")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreModalRow ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) closeRestoreModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-policy-restore-title"
          >
            <h2 id="fee-policy-restore-title" className="text-base font-bold text-sam-fg">
              {t("admin_stores_fee_restore_modal_title")}
            </h2>
            <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_stores_fee_restore_modal_desc")}</p>
            <div className="mt-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
              {t("admin_stores_fee_restore_warn")}
            </div>
            <dl className="mt-4 space-y-2 sam-text-body-secondary">
              <div>
                <dt className="text-sam-muted">{t("admin_stores_fee_th_name")}</dt>
                <dd className="font-medium text-sam-fg">{restoreModalRow.policy_name}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_fee_th_target")}</dt>
                <dd>{targetScopeDescription(restoreModalRow, stores, categories, t)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_fee_th_fee")}</dt>
                <dd>{feeSummary(restoreModalRow)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_fee_th_active")}</dt>
                <dd>
                  {restoreModalRow.is_active
                    ? t("admin_stores_fee_restore_active_on")
                    : t("admin_stores_fee_restore_active_off")}
                </dd>
              </div>
            </dl>
            {restoreModalError ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                {restoreModalError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => closeRestoreModal()}
                className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-medium text-sam-fg disabled:opacity-40"
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmRestore()}
                className="rounded-ui-rect bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t("admin_stores_fee_restore")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

