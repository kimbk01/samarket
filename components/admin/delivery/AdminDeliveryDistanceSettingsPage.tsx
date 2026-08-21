"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type {
  DeliveryDistancePolicy,
  DeliveryDistanceSource,
  DeliveryStoreDistanceMode,
  DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";

type StoreRow = {
  id: string;
  store_name?: string | null;
  slug?: string | null;
  approval_status?: string | null;
  is_visible?: boolean | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const DEFAULT_POLICY: DeliveryDistancePolicy = {
  enabled: false,
  source: "straight",
  defaultMaxKm: null,
  overDistanceBehavior: "deprioritize",
};

const DEFAULT_OVERRIDES: DeliveryStoreDistanceOverrides = {
  stores: {},
};

function parseKmInput(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function kmInputValue(value: number | null): string {
  return value == null ? "" : String(value);
}

function normalizePolicy(raw: unknown): DeliveryDistancePolicy {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const source = o.source === "google" ? "google" : "straight";
  return {
    enabled: o.enabled === true,
    source,
    defaultMaxKm: typeof o.defaultMaxKm === "number" && Number.isFinite(o.defaultMaxKm) && o.defaultMaxKm > 0
      ? Math.round(o.defaultMaxKm * 10) / 10
      : null,
    overDistanceBehavior: "deprioritize",
  };
}

function normalizeOverrides(raw: unknown): DeliveryStoreDistanceOverrides {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const storesRaw = o.stores && typeof o.stores === "object" ? (o.stores as Record<string, unknown>) : {};
  const stores: DeliveryStoreDistanceOverrides["stores"] = {};
  for (const [storeId, value] of Object.entries(storesRaw)) {
    if (!storeId.trim() || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const mode: DeliveryStoreDistanceMode =
      v.mode === "enabled" || v.mode === "disabled" ? v.mode : "inherit";
    const maxKm =
      typeof v.maxKm === "number" && Number.isFinite(v.maxKm) && v.maxKm > 0
        ? Math.round(v.maxKm * 10) / 10
        : null;
    if (mode === "inherit" && maxKm == null) continue;
    stores[storeId] = { mode, maxKm };
  }
  return { stores };
}

function distanceModeLabel(t: ReturnType<typeof useI18n>["t"], mode: DeliveryStoreDistanceMode): string {
  if (mode === "enabled") return t("admin_delivery_distance_store_mode_enabled");
  if (mode === "disabled") return t("admin_delivery_distance_store_mode_disabled");
  return t("admin_delivery_distance_store_mode_inherit");
}

export function AdminDeliveryDistanceSettingsPage() {
  const { t } = useI18n();
  const [policySaved, setPolicySaved] = useState<DeliveryDistancePolicy>(DEFAULT_POLICY);
  const [policyDraft, setPolicyDraft] = useState<DeliveryDistancePolicy>(DEFAULT_POLICY);
  const [defaultMaxKmDraft, setDefaultMaxKmDraft] = useState("");
  const [overridesSaved, setOverridesSaved] = useState<DeliveryStoreDistanceOverrides>(DEFAULT_OVERRIDES);
  const [overridesDraft, setOverridesDraft] = useState<DeliveryStoreDistanceOverrides>(DEFAULT_OVERRIDES);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((text: string) => {
    if (msgTimerRef.current != null) clearTimeout(msgTimerRef.current);
    setMessage(text);
    msgTimerRef.current = setTimeout(() => {
      msgTimerRef.current = null;
      setMessage(null);
    }, 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, storesRes] = await Promise.all([
        fetch("/api/admin/delivery/settings", { credentials: "include" }),
        fetch("/api/admin/stores?status=approved", { credentials: "include" }),
      ]);
      const settingsJson = (await settingsRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        distance_policy?: unknown;
        store_distance_overrides?: unknown;
      };
      const storesJson = (await storesRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        stores?: unknown;
      };
      if (!settingsRes.ok || !settingsJson.ok) {
        setError(settingsJson.error ?? `HTTP ${settingsRes.status}`);
        return;
      }
      if (!storesRes.ok || !storesJson.ok || !Array.isArray(storesJson.stores)) {
        setError(storesJson.error ?? `HTTP ${storesRes.status}`);
        return;
      }
      const nextPolicy = normalizePolicy(settingsJson.distance_policy);
      const nextOverrides = normalizeOverrides(settingsJson.store_distance_overrides);
      setPolicySaved(nextPolicy);
      setPolicyDraft(nextPolicy);
      setDefaultMaxKmDraft(kmInputValue(nextPolicy.defaultMaxKm));
      setOverridesSaved(nextOverrides);
      setOverridesDraft(nextOverrides);
      setStores(storesJson.stores as StoreRow[]);
    } catch {
      setError(t("admin_delivery_distance_error_network"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    return () => {
      if (msgTimerRef.current != null) clearTimeout(msgTimerRef.current);
    };
  }, [load]);

  const filteredStores = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => {
      const name = String(s.store_name ?? "").toLowerCase();
      const slug = String(s.slug ?? "").toLowerCase();
      const loc = [s.region, s.city, s.district].map((x) => String(x ?? "").toLowerCase()).join(" ");
      return name.includes(q) || slug.includes(q) || loc.includes(q);
    });
  }, [stores, query]);

  const dirty = useMemo(
    () =>
      JSON.stringify({
        policy: { ...policyDraft, defaultMaxKm: parseKmInput(defaultMaxKmDraft) },
        overrides: overridesDraft,
      }) !==
      JSON.stringify({
        policy: policySaved,
        overrides: overridesSaved,
      }),
    [policyDraft, defaultMaxKmDraft, overridesDraft, policySaved, overridesSaved]
  );

  const updateStoreOverride = useCallback(
    (storeId: string, patch: Partial<{ mode: DeliveryStoreDistanceMode; maxKm: number | null }>) => {
      setOverridesDraft((prev) => {
        const current = prev.stores[storeId] ?? { mode: "inherit" as const, maxKm: null };
        const next = { ...current, ...patch };
        const storesNext = { ...prev.stores };
        if (next.mode === "inherit" && next.maxKm == null) {
          delete storesNext[storeId];
        } else {
          storesNext[storeId] = next;
        }
        return { stores: storesNext };
      });
    },
    []
  );

  const save = useCallback(async () => {
    const nextPolicy: DeliveryDistancePolicy = {
      ...policyDraft,
      defaultMaxKm: parseKmInput(defaultMaxKmDraft),
      overDistanceBehavior: "deprioritize",
    };
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance_policy: nextPolicy,
          store_distance_overrides: overridesDraft,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        distance_policy?: unknown;
        store_distance_overrides?: unknown;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      const savedPolicy = normalizePolicy(j.distance_policy);
      const savedOverrides = normalizeOverrides(j.store_distance_overrides);
      setPolicySaved(savedPolicy);
      setPolicyDraft(savedPolicy);
      setDefaultMaxKmDraft(kmInputValue(savedPolicy.defaultMaxKm));
      setOverridesSaved(savedOverrides);
      setOverridesDraft(savedOverrides);
      showMessage(t("admin_delivery_distance_saved"));
    } catch {
      setError(t("admin_delivery_distance_error_network"));
    } finally {
      setSaving(false);
    }
  }, [policyDraft, defaultMaxKmDraft, overridesDraft, showMessage, t]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AdminPageHeader
        titleKey="admin_delivery_distance_title"
        descriptionKey="admin_delivery_distance_desc"
      />

      {message ? (
        <p className="mb-4 rounded-ui-rect border border-green-200 bg-green-50 px-3 py-2 sam-text-body-secondary text-green-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {error}
        </p>
      ) : null}

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_delivery_distance_global_title")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_delivery_distance_global_desc")}</p>
          </div>
          <button
            type="button"
            disabled={loading || saving || !dirty}
            onClick={() => void save()}
            className="rounded-ui-rect border border-sam-primary bg-sam-primary px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("admin_stores_saving") : t("admin_delivery_distance_save")}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <span className="block sam-text-helper font-semibold text-sam-muted">
              {t("admin_delivery_distance_enabled")}
            </span>
            <select
              value={policyDraft.enabled ? "1" : "0"}
              onChange={(e) => setPolicyDraft((p) => ({ ...p, enabled: e.target.value === "1" }))}
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg"
            >
              <option value="0">{t("admin_delivery_distance_disabled")}</option>
              <option value="1">{t("admin_delivery_distance_enabled_on")}</option>
            </select>
          </label>

          <label className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <span className="block sam-text-helper font-semibold text-sam-muted">
              {t("admin_delivery_distance_source")}
            </span>
            <select
              value={policyDraft.source}
              onChange={(e) =>
                setPolicyDraft((p) => ({ ...p, source: e.target.value as DeliveryDistanceSource }))
              }
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg"
            >
              <option value="straight">{t("admin_delivery_distance_source_straight")}</option>
              <option value="google">{t("admin_delivery_distance_source_google")}</option>
            </select>
          </label>

          <label className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <span className="block sam-text-helper font-semibold text-sam-muted">
              {t("admin_delivery_distance_default_max")}
            </span>
            <input
              inputMode="decimal"
              value={defaultMaxKmDraft}
              onChange={(e) => setDefaultMaxKmDraft(e.target.value)}
              placeholder={t("admin_delivery_distance_no_limit")}
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg"
            />
          </label>
        </div>

        <p className="mt-3 sam-text-helper text-sam-muted">
          {t("admin_delivery_distance_over_policy")}
        </p>
      </section>

      <section className="mt-5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_delivery_distance_store_title")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_delivery_distance_store_desc")}</p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin_delivery_distance_store_search")}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg md:w-72"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left text-sam-muted">
                <th className="px-2 py-2">{t("admin_delivery_distance_th_store")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_location")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_coords")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_effective")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_mode")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_max")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-2 py-6 text-center text-sam-muted" colSpan={6}>
                    {t("common_loading")}
                  </td>
                </tr>
              ) : filteredStores.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-center text-sam-muted" colSpan={6}>
                    {t("admin_delivery_distance_store_empty")}
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => {
                  const override = overridesDraft.stores[store.id] ?? { mode: "inherit" as const, maxKm: null };
                  const loc = [store.region, store.city, store.district].filter(Boolean).join(" · ");
                  const hasCoords = store.lat != null && store.lng != null;
                  const globalOn = policyDraft.enabled;
                  const effectiveSource =
                    !globalOn || override.mode === "disabled"
                      ? "off"
                      : override.mode === "enabled"
                        ? "store"
                        : "global";
                  const effectiveMax =
                    override.mode === "disabled"
                      ? null
                      : override.maxKm ?? policyDraft.defaultMaxKm;
                  return (
                    <tr key={store.id} className="border-b border-sam-border-soft align-top">
                      <td className="px-2 py-2">
                        <div className="font-semibold text-sam-fg">{store.store_name || store.slug || store.id}</div>
                        <div className="sam-text-helper text-sam-muted">{store.slug}</div>
                      </td>
                      <td className="px-2 py-2 text-sam-muted">{loc || t("admin_delivery_distance_unknown")}</td>
                      <td className="px-2 py-2">
                        {hasCoords ? (
                          <div>
                            <span className="text-sam-muted">
                              {Number(store.lat).toFixed(4)}, {Number(store.lng).toFixed(4)}
                            </span>
                            <div className="mt-1 sam-text-helper text-green-700">
                              {t("admin_delivery_distance_ready")}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-red-700">{t("admin_delivery_distance_coords_missing")}</span>
                            <p className="mt-1 max-w-xs sam-text-helper text-sam-muted">
                              {t("admin_delivery_distance_coords_missing_hint")}
                            </p>
                            {globalOn ? (
                              <div className="mt-1 sam-text-helper text-red-700">
                                {t("admin_delivery_distance_not_ready")}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-sam-muted">
                        {effectiveSource === "off"
                          ? t("admin_delivery_distance_policy_source_off")
                          : effectiveSource === "store"
                            ? t("admin_delivery_distance_policy_source_store")
                            : t("admin_delivery_distance_policy_source_global")}
                        {effectiveSource !== "off" ? (
                          <div className="sam-text-helper">
                            {effectiveMax == null
                              ? t("admin_delivery_distance_no_limit")
                              : `${effectiveMax} km`}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={override.mode}
                          onChange={(e) =>
                            updateStoreOverride(store.id, {
                              mode: e.target.value as DeliveryStoreDistanceMode,
                            })
                          }
                          className="min-w-32 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                          aria-label={distanceModeLabel(t, override.mode)}
                        >
                          <option value="inherit">{t("admin_delivery_distance_store_mode_inherit")}</option>
                          <option value="enabled">{t("admin_delivery_distance_store_mode_enabled")}</option>
                          <option value="disabled">{t("admin_delivery_distance_store_mode_disabled")}</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          inputMode="decimal"
                          value={kmInputValue(override.maxKm)}
                          onChange={(e) =>
                            updateStoreOverride(store.id, {
                              maxKm: parseKmInput(e.target.value),
                            })
                          }
                          placeholder={t("admin_delivery_distance_inherit_max")}
                          className="w-32 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
