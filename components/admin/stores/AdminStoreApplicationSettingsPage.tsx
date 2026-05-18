"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { invalidateStoreDeliveryAlertSoundCache } from "@/lib/business/store-order-alert-sound";
import { bustOrderMatchAlertSoundCache } from "@/lib/notifications/play-order-match-alert";
import { clearStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";

function slugifyLoose(raw: string): string {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return t.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function AdminStoreApplicationSettingsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const menu = (searchParams.get("menu") ?? "").trim().toLowerCase();
  const activeMenu: "alerts" | "stores" = menu === "stores" ? "stores" : "alerts";

  const [taxonomy, setTaxonomy] = useState<{ categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] } | null>(
    null
  );
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomySeeding, setTaxonomySeeding] = useState(false);
  const [pickedCategoryId, setPickedCategoryId] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryDraft, setEditingCategoryDraft] = useState<{ name: string; sort_order: number } | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicDraft, setEditingTopicDraft] = useState<{ name: string; sort_order: number } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicSlug, setNewTopicSlug] = useState("");
  const [taxonomyImageUploading, setTaxonomyImageUploading] = useState<string | null>(null);
  const [riderLocationEnabled, setRiderLocationEnabled] = useState(false);
  const [riderLocationLoading, setRiderLocationLoading] = useState(false);
  const [riderLocationSaving, setRiderLocationSaving] = useState(false);
  const [riderLocationError, setRiderLocationError] = useState<string | null>(null);
  const [rideTimeSourceSaved, setRideTimeSourceSaved] = useState<"store" | "google">("store");
  const [rideTimeSourceDraft, setRideTimeSourceDraft] = useState<"store" | "google">("store");
  const [rideTimeSourceSaving, setRideTimeSourceSaving] = useState(false);
  const [rideTimeSourceError, setRideTimeSourceError] = useState<string | null>(null);

  const rideTimeSourceDirty = useMemo(
    () => rideTimeSourceDraft !== rideTimeSourceSaved,
    [rideTimeSourceDraft, rideTimeSourceSaved]
  );

  const loadRiderLocationSetting = useCallback(async () => {
    setRiderLocationLoading(true);
    setRiderLocationError(null);
    setRideTimeSourceError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rider_location_enabled?: unknown;
        ride_time_source?: unknown;
      };
      if (!res.ok || !j?.ok) {
        setRiderLocationError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      setRiderLocationEnabled(j.rider_location_enabled === true);
      const src = j.ride_time_source === "google" ? "google" : "store";
      setRideTimeSourceSaved(src);
      setRideTimeSourceDraft(src);
    } catch {
      setRiderLocationError("network_error");
    } finally {
      setRiderLocationLoading(false);
    }
  }, []);

  const saveRiderLocationSetting = useCallback(async (next: boolean) => {
    setRiderLocationSaving(true);
    setRiderLocationError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rider_location_enabled: next }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rider_location_enabled?: unknown;
        ride_time_source?: unknown;
      };
      if (!res.ok || !j?.ok) {
        setRiderLocationError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      setRiderLocationEnabled(j.rider_location_enabled === true);
      if (j.ride_time_source === "google" || j.ride_time_source === "store") {
        setRideTimeSourceSaved(j.ride_time_source);
        setRideTimeSourceDraft(j.ride_time_source);
      }
      setMsg(t("admin_stores_saved"));
      window.setTimeout(() => setMsg(null), 2800);
    } catch {
      setRiderLocationError("network_error");
    } finally {
      setRiderLocationSaving(false);
    }
  }, []);

  const commitRideTimeSource = useCallback(async () => {
    const next = rideTimeSourceDraft;
    setRideTimeSourceSaving(true);
    setRideTimeSourceError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_time_source: next }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        ride_time_source?: unknown;
      };
      if (!res.ok || !j?.ok) {
        setRideTimeSourceError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      const src = j.ride_time_source === "google" ? "google" : "store";
      setRideTimeSourceSaved(src);
      setRideTimeSourceDraft(src);
      setMsg(t("admin_stores_app_ride_time_saved"));
      window.setTimeout(() => setMsg(null), 2800);
    } catch {
      setRideTimeSourceError("network_error");
    } finally {
      setRideTimeSourceSaving(false);
    }
  }, [rideTimeSourceDraft]);

  useEffect(() => {
    void loadRiderLocationSetting();
  }, [loadRiderLocationSetting]);

  useEffect(() => {
    if (activeMenu !== "stores") return;
    let cancelled = false;
    setTaxonomyLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/admin/stores/taxonomy", { cache: "no-store", credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          categories?: unknown;
          topics?: unknown;
        };
        if (cancelled) return;
        if (res.ok && j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
          setTaxonomy({
            categories: j.categories as StoreTaxonomyCategory[],
            topics: j.topics as StoreTaxonomyTopic[],
          });
          clearStoresTaxonomyClientCache();
          const first = (j.categories as StoreTaxonomyCategory[])[0];
          setPickedCategoryId((prev) => prev || first?.id || "");
        } else {
          setTaxonomy(null);
        }
      } catch {
        if (!cancelled) setTaxonomy(null);
      } finally {
        if (!cancelled) setTaxonomyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMenu]);

  const categories = useMemo(() => taxonomy?.categories ?? [], [taxonomy]);
  const topics = useMemo(() => taxonomy?.topics ?? [], [taxonomy]);
  const topicsForPicked = useMemo(
    () =>
      topics
        .filter((t) => t.store_category_id === pickedCategoryId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [topics, pickedCategoryId]
  );

  const reloadTaxonomy = useCallback(async () => {
    setTaxonomyLoading(true);
    try {
      const res = await fetch("/api/admin/stores/taxonomy", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; categories?: unknown; topics?: unknown };
      if (res.ok && j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
        setTaxonomy({ categories: j.categories as StoreTaxonomyCategory[], topics: j.topics as StoreTaxonomyTopic[] });
        clearStoresTaxonomyClientCache();
      }
    } finally {
      setTaxonomyLoading(false);
    }
  }, []);

  const uploadTaxonomyImage = useCallback(
    async (kind: "category" | "topic", id: string, file: File) => {
      const key = `${kind}:${id}`;
      setTaxonomyImageUploading(key);
      try {
        const fd = new FormData();
        fd.append("kind", kind);
        fd.append("id", id);
        fd.append("file", file);
        const res = await fetch("/api/admin/stores/taxonomy/upload-image", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; url?: string };
        if (!res.ok || !j?.ok) {
          window.alert(j.message ?? j.error ?? t("admin_stores_app_taxonomy_err_upload"));
          return;
        }
        setMsg(t("admin_stores_app_taxonomy_msg_image"));
        window.setTimeout(() => setMsg(null), 4000);
        await reloadTaxonomy();
      } catch {
        window.alert("network_error");
      } finally {
        setTaxonomyImageUploading((prev) => (prev === key ? null : prev));
      }
    },
    [reloadTaxonomy]
  );

  const seedDefaults = useCallback(async () => {
    if (!window.confirm(t("admin_stores_app_taxonomy_confirm_seed"))) return;
    setTaxonomyLoading(true);
    setTaxonomySeeding(true);
    try {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        seeded?: { categories?: number; topics?: number };
      };
      if (!res.ok || !j.ok) {
        window.alert(j.error ?? t("admin_stores_app_taxonomy_err_seed"));
        return;
      }
      setMsg(
        t("admin_stores_app_taxonomy_msg_seed", {
          categories: j.seeded?.categories ?? 0,
          topics: j.seeded?.topics ?? 0,
        })
      );
      window.setTimeout(() => setMsg(null), 4000);
      await reloadTaxonomy();
    } finally {
      setTaxonomyLoading(false);
      setTaxonomySeeding(false);
    }
  }, [reloadTaxonomy]);

  const createCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    const slug = slugifyLoose(newCategorySlug || name);
    if (!name || !slug) return;
    const sort_order = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 10;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "category", name, slug, sort_order }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? t("admin_stores_app_taxonomy_err_create"));
      return;
    }
    setNewCategoryName("");
    setNewCategorySlug("");
    setMsg(t("admin_stores_app_taxonomy_msg_created"));
    window.setTimeout(() => setMsg(null), 4000);
    await reloadTaxonomy();
  }, [newCategoryName, newCategorySlug, categories, reloadTaxonomy]);

  const createTopic = useCallback(async () => {
    const name = newTopicName.trim();
    const slug = slugifyLoose(newTopicSlug || name);
    if (!pickedCategoryId || !name || !slug) return;
    const sort_order =
      topicsForPicked.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0) + 10;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "topic",
        store_category_id: pickedCategoryId,
        name,
        slug,
        sort_order,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? t("admin_stores_app_taxonomy_err_create"));
      return;
    }
    setNewTopicName("");
    setNewTopicSlug("");
    setMsg(t("admin_stores_app_taxonomy_msg_created"));
    window.setTimeout(() => setMsg(null), 4000);
    await reloadTaxonomy();
  }, [newTopicName, newTopicSlug, pickedCategoryId, topicsForPicked, reloadTaxonomy]);

  const saveCategory = useCallback(async () => {
    if (!editingCategoryId || !editingCategoryDraft) return;
    const name = editingCategoryDraft.name.trim();
    if (!name) return;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "category",
        id: editingCategoryId,
        patch: { name, sort_order: editingCategoryDraft.sort_order },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? t("admin_stores_app_taxonomy_err_save"));
      return;
    }
    setMsg(t("admin_stores_app_taxonomy_msg_saved"));
    window.setTimeout(() => setMsg(null), 4000);
    setEditingCategoryId(null);
    setEditingCategoryDraft(null);
    await reloadTaxonomy();
  }, [editingCategoryId, editingCategoryDraft, reloadTaxonomy]);

  const saveTopic = useCallback(async () => {
    if (!editingTopicId || !editingTopicDraft) return;
    const name = editingTopicDraft.name.trim();
    if (!name) return;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "topic",
        id: editingTopicId,
        patch: { name, sort_order: editingTopicDraft.sort_order },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? t("admin_stores_app_taxonomy_err_save"));
      return;
    }
    setMsg(t("admin_stores_app_taxonomy_msg_saved"));
    window.setTimeout(() => setMsg(null), 4000);
    setEditingTopicId(null);
    setEditingTopicDraft(null);
    await reloadTaxonomy();
  }, [editingTopicId, editingTopicDraft, reloadTaxonomy]);

  const toggleCategoryActive = useCallback(
    async (id: string, nextActive: boolean) => {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "category",
          id,
          patch: { is_active: nextActive },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        window.alert(j.error ?? t("admin_stores_app_taxonomy_err_toggle"));
        return;
      }
      setMsg(t("admin_stores_app_taxonomy_msg_applied"));
      window.setTimeout(() => setMsg(null), 4000);
      await reloadTaxonomy();
    },
    [reloadTaxonomy]
  );

  const toggleTopicActive = useCallback(
    async (id: string, nextActive: boolean) => {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "topic",
          id,
          patch: { is_active: nextActive },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        window.alert(j.error ?? t("admin_stores_app_taxonomy_err_toggle"));
        return;
      }
      setMsg(t("admin_stores_app_taxonomy_msg_applied"));
      window.setTimeout(() => setMsg(null), 4000);
      await reloadTaxonomy();
    },
    [reloadTaxonomy]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AdminPageHeader
        titleKey="admin_page_store_application_settings"
        descriptionKey="admin_page_store_application_settings_desc"
      />

      <nav className="mt-5 flex items-center gap-2">
        <Link
          href="/admin/stores/application-settings?menu=alerts"
          className={`rounded-full border px-3 py-1.5 sam-text-body-secondary font-semibold transition ${
            activeMenu === "alerts"
              ? "border-sam-primary/40 bg-sam-primary-soft text-sam-primary"
              : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
          }`}
          aria-current={activeMenu === "alerts" ? "page" : undefined}
        >
          {t("admin_stores_app_menu_alerts")}
        </Link>
        <Link
          href="/admin/stores/application-settings?menu=stores"
          className={`rounded-full border px-3 py-1.5 sam-text-body-secondary font-semibold transition ${
            activeMenu === "stores"
              ? "border-sam-primary/40 bg-sam-primary-soft text-sam-primary"
              : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
          }`}
          aria-current={activeMenu === "stores" ? "page" : undefined}
        >
          {t("admin_stores_app_menu_stores")}
        </Link>
      </nav>

      {activeMenu === "alerts" ? (
        <>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_rider_tracking")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_app_rider_tracking_desc")}</p>
            <p className="mt-1 sam-text-xxs text-sam-meta">
              <code className="rounded bg-sam-surface-muted px-1">admin_settings.delivery_rider_location_enabled</code>
            </p>
            {riderLocationError ? (
              <p className="mt-2 sam-text-body-secondary text-red-700">({riderLocationError})</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={riderLocationLoading || riderLocationSaving}
                onClick={() => void saveRiderLocationSetting(!riderLocationEnabled)}
                className={`rounded-ui-rect border px-4 py-2 sam-text-body-secondary font-semibold disabled:opacity-50 ${
                  riderLocationEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-sam-border bg-sam-app text-sam-fg"
                }`}
              >
                {riderLocationLoading
                  ? t("common_loading")
                  : riderLocationSaving
                    ? t("admin_stores_saving")
                    : riderLocationEnabled
                      ? t("admin_stores_app_rider_on")
                      : t("admin_stores_app_rider_off")}
              </button>
              <button
                type="button"
                disabled={riderLocationLoading || riderLocationSaving}
                onClick={() => void loadRiderLocationSetting()}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-fg disabled:opacity-50"
              >
                {t("admin_stores_fee_refresh")}
              </button>
            </div>
          </section>

          <AdminGlobalAlertSoundSection
            titleKey="admin_stores_app_alert_delivery_title"
            descriptionKey="admin_stores_app_alert_delivery_desc"
            codeKey="admin_settings.store_delivery_alert_sound"
            apiPath="/api/admin/store-delivery-alert-sound"
            onAfterMutation={invalidateStoreDeliveryAlertSoundCache}
          />

          <AdminGlobalAlertSoundSection
            titleKey="admin_stores_app_alert_match_title"
            descriptionKey="admin_stores_app_alert_match_desc"
            codeKey="admin_settings.order_match_chat_alert_sound"
            apiPath="/api/admin/order-match-chat-alert-sound"
            onAfterMutation={bustOrderMatchAlertSoundCache}
          />
        </>
      ) : null}

      {activeMenu === "stores" ? (
        <>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_ride_time_title")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_app_ride_time_desc")}</p>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_app_ride_time_save_hint")}</p>
            <p className="mt-1 sam-text-xxs text-sam-meta">
              <code className="rounded bg-sam-surface-muted px-1">admin_settings.delivery_ride_time_source</code>
            </p>
            {rideTimeSourceError ? (
              <p className="mt-2 sam-text-body-secondary text-red-700">({rideTimeSourceError})</p>
            ) : null}
            <fieldset className="mt-3 space-y-2" disabled={riderLocationLoading || rideTimeSourceSaving}>
              <legend className="sr-only">{t("admin_stores_app_ride_time_legend")}</legend>
              <label className="flex cursor-pointer items-start gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <input
                  type="radio"
                  name="ride_time_source"
                  className="mt-1"
                  checked={rideTimeSourceDraft === "store"}
                  onChange={() => setRideTimeSourceDraft("store")}
                />
                <span>
                  <span className="font-semibold text-sam-fg">{t("admin_stores_app_ride_time_store")}</span>
                  <span className="mt-0.5 block sam-text-helper text-sam-muted">
                    {t("admin_stores_app_ride_time_store_desc")}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <input
                  type="radio"
                  name="ride_time_source"
                  className="mt-1"
                  checked={rideTimeSourceDraft === "google"}
                  onChange={() => setRideTimeSourceDraft("google")}
                />
                <span>
                  <span className="font-semibold text-sam-fg">{t("admin_stores_app_ride_time_google")}</span>
                  <span className="mt-0.5 block sam-text-helper text-sam-muted">
                    {t("admin_stores_app_ride_time_google_desc")}
                  </span>
                </span>
              </label>
            </fieldset>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={riderLocationLoading || rideTimeSourceSaving || !rideTimeSourceDirty}
                onClick={() => void commitRideTimeSource()}
                className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
              >
                {rideTimeSourceSaving ? t("admin_stores_saving") : t("common_save")}
              </button>
              <button
                type="button"
                disabled={riderLocationLoading || rideTimeSourceSaving || !rideTimeSourceDirty}
                onClick={() => setRideTimeSourceDraft(rideTimeSourceSaved)}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg disabled:opacity-50"
              >
                {t("admin_stores_app_ride_time_cancel")}
              </button>
              <span className="sam-text-helper text-sam-muted">
                {t("admin_stores_app_ride_time_current", {
                  value:
                    rideTimeSourceSaved === "google"
                      ? t("admin_stores_app_ride_time_google")
                      : t("admin_stores_app_ride_time_store"),
                })}
              </span>
            </div>
            <p className="mt-2 sam-text-helper text-sam-muted">
              {rideTimeSourceSaving ? t("admin_stores_saving") : riderLocationLoading ? t("common_loading") : null}
            </p>
          </section>

          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_integration_title")}</h2>
            <ul className="mt-3 space-y-2 sam-text-body-secondary text-sam-fg">
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t("admin_stores_app_integration_apply")}</span>
                <Link href="/stores/owner/apply" className="text-signature underline">
                  /stores/owner/apply
                </Link>
                <span className="text-sam-muted">{t("admin_stores_app_integration_apply_desc")}</span>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>{t("admin_stores_app_integration_browse")}</span>
                <Link href="/stores" className="text-signature underline">
                  /stores
                </Link>
                <span className="text-sam-muted">
                  {t("admin_stores_app_integration_browse_desc")}{" "}
                  <code className="rounded bg-sam-surface-muted px-1">/stores/browse/[primary]/[sub]</code>)
                </span>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-amber-600">△</span>
                <span>{t("admin_stores_app_integration_review")}</span>
                <Link href="/admin/stores" className="text-signature underline">
                  /admin/stores
                </Link>
                <span className="text-sam-muted">{t("admin_stores_app_integration_review_desc")}</span>
              </li>
            </ul>
            <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_stores_app_integration_save_hint")}</p>
          </section>
        </>
      ) : null}

      {msg && (
        <p className="mt-4 rounded-ui-rect border border-green-200 bg-green-50 px-3 py-2 sam-text-body-secondary text-green-800">
          {msg}
        </p>
      )}

      {activeMenu === "stores" ? (
        <>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_taxonomy_title")}</h2>
                <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_stores_app_taxonomy_desc")}</p>
              </div>
              <button type="button" onClick={() => void reloadTaxonomy()} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg">
                {t("admin_stores_fee_refresh")}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* 1차 업종 */}
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_taxonomy_primary")}</h3>
                    <p className="mt-0.5 sam-text-helper text-sam-muted">{t("admin_stores_app_taxonomy_primary_hint")}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    {t("admin_stores_app_taxonomy_ph_name")}
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder={t("admin_stores_app_taxonomy_ph_category_example")}
                    />
                  </label>
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    {t("admin_stores_app_taxonomy_label_slug")}
                    <input
                      value={newCategorySlug}
                      onChange={(e) => setNewCategorySlug(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder={t("admin_stores_app_taxonomy_ph_slug_auto")}
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => void createCategory()}
                      className="w-full rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
                      disabled={!newCategoryName.trim()}
                    >
                      {t("admin_stores_app_taxonomy_add_primary")}
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-ui-rect border border-sam-border">
                  <div className="grid grid-cols-[40px_minmax(0,1fr)_128px] gap-0 border-b border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-semibold text-sam-muted">
                    <span>{t("admin_stores_app_taxonomy_th_image")}</span>
                    <span>{t("admin_stores_app_taxonomy_th_category")}</span>
                    <span className="text-right">{t("admin_stores_app_taxonomy_th_actions")}</span>
                  </div>
                  <ul className="divide-y divide-sam-border-soft">
                    {taxonomyLoading && categories.length === 0 ? (
                      <li className="px-3 py-3 sam-text-body-secondary text-sam-muted">{t("common_loading")}</li>
                    ) : categories.length === 0 ? (
                      <li className="px-3 py-3">
                        <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_app_taxonomy_empty_category")}</p>
                        <button
                          type="button"
                          onClick={() => void seedDefaults()}
                          className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg"
                        >
                          {t("admin_stores_app_taxonomy_seed")}
                        </button>
                      </li>
                    ) : (
                      categories.map((c) => {
                        const isEditing = editingCategoryId === c.id && editingCategoryDraft != null;
                        const uploadKey = `category:${c.id}`;
                        const isUploading = taxonomyImageUploading === uploadKey;
                      return (
                        <li key={c.id} className="px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 gap-2">
                              <div className="pt-0.5">
                                {c.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={c.image_url}
                                    alt=""
                                    aria-hidden
                                    className="h-9 w-9 rounded-ui-rect border border-sam-border object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-ui-rect border border-dashed border-sam-border bg-sam-app sam-text-xxs font-semibold text-sam-muted">
                                    {t("common_none")}
                                  </div>
                                )}
                              </div>
                              {isEditing ? (
                                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                                  <input
                                    value={editingCategoryDraft.name}
                                    onChange={(e) =>
                                      setEditingCategoryDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                                    }
                                    className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                    placeholder={t("admin_stores_app_taxonomy_ph_name")}
                                  />
                                  <input
                                    value={String(editingCategoryDraft.sort_order)}
                                    onChange={(e) =>
                                      setEditingCategoryDraft((prev) =>
                                        prev ? { ...prev, sort_order: Number(e.target.value) || 0 } : prev
                                      )
                                    }
                                    className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                    placeholder="sort_order"
                                  />
                                </div>
                              ) : (
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-sam-fg">{c.name}</span>
                                    <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                                      {c.is_active ? t("common_active") : t("common_hidden")}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 truncate sam-text-xxs text-sam-meta">slug: {c.slug}</p>
                                </div>
                              )}
                            </div>

                            <div className="shrink-0">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => void saveCategory()} className="sam-text-helper font-semibold text-signature underline">
                                    {t("common_save")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCategoryId(null);
                                      setEditingCategoryDraft(null);
                                    }}
                                    className="sam-text-helper font-semibold text-sam-muted underline"
                                  >
                                    {t("common_cancel")}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <label className="sam-text-helper font-semibold text-sam-muted underline">
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      className="sr-only"
                                      disabled={isUploading}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = "";
                                        if (!f) return;
                                        void uploadTaxonomyImage("category", c.id, f);
                                      }}
                                    />
                                    {isUploading
                                      ? t("admin_stores_app_taxonomy_uploading")
                                      : c.image_url
                                        ? t("admin_stores_app_taxonomy_change_image")
                                        : t("admin_stores_app_taxonomy_add_image")}
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTopicId(null);
                                      setEditingTopicDraft(null);
                                      setEditingCategoryId(c.id);
                                      setEditingCategoryDraft({ name: c.name, sort_order: c.sort_order });
                                    }}
                                    className="sam-text-helper font-semibold text-signature underline"
                                  >
                                    {t("common_edit")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextActive = !c.is_active;
                                      const label = nextActive
                                        ? t("admin_stores_app_taxonomy_confirm_show")
                                        : t("admin_stores_app_taxonomy_confirm_hide");
                                      if (!window.confirm(label)) return;
                                      void toggleCategoryActive(c.id, nextActive);
                                    }}
                                    className="sam-text-helper font-semibold text-red-600 underline"
                                  >
                                    {c.is_active ? t("common_delete") : t("admin_stores_app_taxonomy_restore")}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                      })
                    )}
                  </ul>
                </div>
              </div>

              {/* 2차 업종 */}
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_taxonomy_secondary")}</h3>
                    <p className="mt-0.5 sam-text-helper text-sam-muted">{t("admin_stores_app_taxonomy_secondary_hint")}</p>
                  </div>
                </div>

                <label className="mt-3 block sam-text-helper text-sam-muted">
                  {t("admin_stores_app_taxonomy_pick_primary")}
                  <select
                    value={pickedCategoryId}
                    onChange={(e) => setPickedCategoryId(e.target.value)}
                    className="mt-1 w-full rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slug})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    {t("admin_stores_app_taxonomy_sub_name")}
                    <input
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder={t("admin_stores_app_taxonomy_ph_topic_example")}
                      disabled={!pickedCategoryId}
                    />
                  </label>
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    {t("admin_stores_app_taxonomy_label_slug")}
                    <input
                      value={newTopicSlug}
                      onChange={(e) => setNewTopicSlug(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder={t("admin_stores_app_taxonomy_ph_slug_auto")}
                      disabled={!pickedCategoryId}
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => void createTopic()}
                      className="w-full rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
                      disabled={!pickedCategoryId || !newTopicName.trim()}
                    >
                      {t("admin_stores_app_taxonomy_add_secondary")}
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-ui-rect border border-sam-border">
                  <div className="grid grid-cols-[40px_minmax(0,1fr)_128px] gap-0 border-b border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-semibold text-sam-muted">
                    <span>{t("admin_stores_app_taxonomy_th_image")}</span>
                    <span>{t("admin_stores_app_taxonomy_th_subcategory")}</span>
                    <span className="text-right">{t("admin_stores_app_taxonomy_th_actions")}</span>
                  </div>
                  <ul className="divide-y divide-sam-border-soft">
                    {taxonomyLoading && topicsForPicked.length === 0 ? (
                      <li className="px-3 py-3 sam-text-body-secondary text-sam-muted">{t("common_loading")}</li>
                    ) : topicsForPicked.length === 0 ? (
                      <li className="px-3 py-3">
                        <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_app_taxonomy_empty_topic")}</p>
                        <button
                          type="button"
                          onClick={() => void seedDefaults()}
                          disabled={taxonomySeeding}
                          className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg"
                        >
                          {taxonomySeeding ? t("admin_stores_app_taxonomy_seeding") : t("admin_stores_app_taxonomy_seed_topic")}
                        </button>
                      </li>
                    ) : (
                      topicsForPicked.map((topicRow) => {
                        const isEditing = editingTopicId === topicRow.id && editingTopicDraft != null;
                        const uploadKey = `topic:${topicRow.id}`;
                        const isUploading = taxonomyImageUploading === uploadKey;
                        return (
                          <li key={topicRow.id} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-1 gap-2">
                                <div className="pt-0.5">
                                  {topicRow.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={topicRow.image_url}
                                      alt=""
                                      aria-hidden
                                      className="h-9 w-9 rounded-ui-rect border border-sam-border object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-9 w-9 items-center justify-center rounded-ui-rect border border-dashed border-sam-border bg-sam-app sam-text-xxs font-semibold text-sam-muted">
                                      {t("common_none")}
                                    </div>
                                  )}
                                </div>
                                {isEditing ? (
                                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                                    <input
                                      value={editingTopicDraft.name}
                                      onChange={(e) =>
                                        setEditingTopicDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                                      }
                                      className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                      placeholder={t("admin_stores_app_taxonomy_ph_name")}
                                    />
                                    <input
                                      value={String(editingTopicDraft.sort_order)}
                                      onChange={(e) =>
                                        setEditingTopicDraft((prev) =>
                                          prev ? { ...prev, sort_order: Number(e.target.value) || 0 } : prev
                                        )
                                      }
                                      className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                      placeholder="sort_order"
                                    />
                                  </div>
                                ) : (
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-sam-fg">{topicRow.name}</span>
                                      <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                                        {topicRow.is_active ? t("common_active") : t("common_hidden")}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 truncate sam-text-xxs text-sam-meta">slug: {topicRow.slug}</p>
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0">
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => void saveTopic()} className="sam-text-helper font-semibold text-signature underline">
                                      {t("common_save")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingTopicId(null);
                                        setEditingTopicDraft(null);
                                      }}
                                      className="sam-text-helper font-semibold text-sam-muted underline"
                                    >
                                      {t("common_cancel")}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <label className="sam-text-helper font-semibold text-sam-muted underline">
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="sr-only"
                                        disabled={isUploading}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          e.target.value = "";
                                          if (!f) return;
                                          void uploadTaxonomyImage("topic", topicRow.id, f);
                                        }}
                                      />
                                      {isUploading
                                        ? t("admin_stores_app_taxonomy_uploading")
                                        : topicRow.image_url
                                          ? t("admin_stores_app_taxonomy_change_image")
                                          : t("admin_stores_app_taxonomy_add_image")}
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCategoryId(null);
                                        setEditingCategoryDraft(null);
                                        setEditingTopicId(topicRow.id);
                                        setEditingTopicDraft({ name: topicRow.name, sort_order: topicRow.sort_order });
                                      }}
                                      className="sam-text-helper font-semibold text-signature underline"
                                    >
                                      {t("common_edit")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextActive = !topicRow.is_active;
                                        const label = nextActive
                                          ? t("admin_stores_app_taxonomy_confirm_show")
                                          : t("admin_stores_app_taxonomy_confirm_hide");
                                        if (!window.confirm(label)) return;
                                        void toggleTopicActive(topicRow.id, nextActive);
                                      }}
                                      className="sam-text-helper font-semibold text-red-600 underline"
                                    >
                                      {topicRow.is_active ? t("common_delete") : t("admin_stores_app_taxonomy_restore")}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

    </div>
  );
}
