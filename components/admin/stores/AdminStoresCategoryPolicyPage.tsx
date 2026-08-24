"use client";

/**
 * 카테고리 관리 — 1차 선택 → 운영 설정 + 2차 inherit/override.
 * 전 업종 정책 테이블 UX 금지.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Sam } from "@/lib/ui/sam-component-classes";
import type {
  StoresBrowseScopePolicyResolved,
  StoresBrowseScopePolicyRow,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";

type PrimaryRow = {
  primarySlug: string;
  nameKo: string;
  nameEn: string;
  scopeKey: string;
  row: StoresBrowseScopePolicyRow | null;
  resolved: StoresBrowseScopePolicyResolved;
};

type SecondaryRow = {
  subSlug: string;
  nameKo: string;
  nameEn: string;
  scopeKey: string;
  row: StoresBrowseScopePolicyRow | null;
  resolved: StoresBrowseScopePolicyResolved;
};

type DraftPrimary = {
  enabled: boolean;
  draftTitleKo: string;
  draftTitleEn: string;
  adEnabled: boolean;
  couponEnabled: boolean;
  draftMax: string;
  draftInterval: string;
};

type DraftSecondary = {
  mode: "inherit" | "override";
  enabled: boolean;
  draftTitleKo: string;
  adEnabled: boolean;
  couponEnabled: boolean;
  draftMax: string;
  draftInterval: string;
};

function CategoryCardPreview({
  title,
  ad,
  coupon,
}: {
  title: string;
  ad: boolean;
  coupon: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="rounded-ui-rect border border-sam-border bg-sam-app p-3"
      data-admin-category-card-preview="true"
    >
      <div className="mb-2 grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square rounded-[2.9px] bg-sam-surface-muted" />
        ))}
      </div>
      {(ad || coupon) ?
        <div
          className={`mb-2 flex h-[31px] items-center gap-2 rounded px-2 text-[11px] font-semibold ${
            ad ? "bg-signature/15 text-signature" : "bg-purple-100 text-purple-800"
          }`}
        >
          {ad ? t("store_insertion_sponsored") : t("store_badge_coupon")}
          <span className="font-normal text-sam-muted">· {t("admin_stores_category_preview_benefit")}</span>
        </div>
      : null}
      <p className="text-[14px] font-semibold text-sam-fg">{title}</p>
      <p className="mt-1 text-[12px] text-sam-muted">★ 4.8 (128) · 25–35분 · 배달비 ₱40</p>
      <div className="mt-2 flex gap-1">
        <span className="rounded bg-sam-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-sam-success">
          {t("store_open_now")}
        </span>
        {coupon ?
          <span className="rounded bg-signature/15 px-1.5 py-0.5 text-[10px] font-semibold text-signature">
            {t("store_badge_coupon")}
          </span>
        : null}
      </div>
    </div>
  );
}

export function AdminStoresCategoryPolicyPage() {
  const { t, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPrimary = searchParams.get("primary")?.trim().toLowerCase() ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [primaries, setPrimaries] = useState<PrimaryRow[]>([]);
  const [secondaries, setSecondaries] = useState<SecondaryRow[]>([]);
  const [draftPrimary, setDraftPrimary] = useState<DraftPrimary | null>(null);
  const [draftSubs, setDraftSubs] = useState<Record<string, DraftSecondary>>({});
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const qs = selectedPrimary ? `?primary=${encodeURIComponent(selectedPrimary)}` : "";
      const res = await fetch(`/api/admin/stores-category-policy${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        revision?: number;
        primaries?: PrimaryRow[];
        secondary?: SecondaryRow[];
      };
      if (!res.ok || !json.ok || !json.primaries) {
        setErr(json.error ?? "load_fail");
        setPrimaries([]);
        setSecondaries([]);
        setRevision(null);
        return;
      }
      setRevision(typeof json.revision === "number" ? json.revision : 0);
      setPrimaries(json.primaries);
      const secs = json.secondary ?? [];
      setSecondaries(secs);

      const primary = json.primaries.find((p) => p.primarySlug === selectedPrimary);
      if (primary) {
        setDraftPrimary({
          enabled: primary.resolved.enabled,
          draftTitleKo: primary.resolved.displayTitleKo ?? primary.nameKo,
          draftTitleEn: primary.resolved.displayTitleEn ?? primary.nameEn,
          adEnabled: primary.resolved.adEnabled,
          couponEnabled: primary.resolved.couponEnabled,
          draftMax: primary.resolved.maxInsertion == null ? "" : String(primary.resolved.maxInsertion),
          draftInterval: String(primary.resolved.intervalEveryN),
        });
      } else {
        setDraftPrimary(null);
      }

      const nextSubs: Record<string, DraftSecondary> = {};
      for (const s of secs) {
        const hasOverride = s.row != null;
        nextSubs[s.subSlug] = {
          mode: hasOverride ? "override" : "inherit",
          enabled: s.resolved.enabled,
          draftTitleKo: s.resolved.displayTitleKo ?? s.nameKo,
          adEnabled: s.resolved.adEnabled,
          couponEnabled: s.resolved.couponEnabled,
          draftMax: s.resolved.maxInsertion == null ? "" : String(s.resolved.maxInsertion),
          draftInterval: String(s.resolved.intervalEveryN),
        };
      }
      setDraftSubs(nextSubs);
      setSelectedSub((prev) => prev && nextSubs[prev] ? prev : secs[0]?.subSlug ?? null);
    } catch {
      setErr("load_fail");
    } finally {
      setLoading(false);
    }
  }, [selectedPrimary]);

  useEffect(() => {
    void load();
  }, [load]);

  const primaryMeta = useMemo(
    () => primaries.find((p) => p.primarySlug === selectedPrimary) ?? null,
    [primaries, selectedPrimary]
  );

  const selectPrimary = (slug: string) => {
    router.replace(`/admin/stores-category-policy?primary=${encodeURIComponent(slug)}`);
  };

  const onSavePrimary = async () => {
    if (!primaryMeta || !draftPrimary || revision == null) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/admin/stores-category-policy", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          rows: [
            {
              scopeKey: primaryMeta.scopeKey,
              primarySlug: primaryMeta.primarySlug,
              subSlug: null,
              enabled: draftPrimary.enabled,
              displayTitleKo: draftPrimary.draftTitleKo,
              displayTitleEn: draftPrimary.draftTitleEn,
              adEnabled: draftPrimary.adEnabled ? "true" : "false",
              couponEnabled: draftPrimary.couponEnabled ? "true" : "false",
              maxInsertion: draftPrimary.draftMax.trim() === "" ? null : Number(draftPrimary.draftMax),
              intervalEveryN: Number(draftPrimary.draftInterval) || 8,
              presentationMode: "card_benefit_integrated",
            },
          ],
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; revision?: number };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error === "stale_revision" ? "stale_revision" : (json.error ?? "save_fail"));
        return;
      }
      if (typeof json.revision === "number") setRevision(json.revision);
      setSaveMsg(t("admin_stores_category_save_ok"));
      await load();
    } catch {
      setSaveErr("save_fail");
    } finally {
      setSaving(false);
    }
  };

  const onSaveSecondary = async (subSlug: string) => {
    const meta = secondaries.find((s) => s.subSlug === subSlug);
    const draft = draftSubs[subSlug];
    if (!meta || !draft || !primaryMeta || revision == null) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const row =
        draft.mode === "inherit"
          ? {
              scopeKey: meta.scopeKey,
              primarySlug: primaryMeta.primarySlug,
              subSlug: meta.subSlug,
              enabled: true,
              displayTitleKo: null,
              displayTitleEn: null,
              adEnabled: "inherit" as const,
              couponEnabled: "inherit" as const,
              maxInsertion: null,
              intervalEveryN: null,
              presentationMode: "inherit" as const,
            }
          : {
              scopeKey: meta.scopeKey,
              primarySlug: primaryMeta.primarySlug,
              subSlug: meta.subSlug,
              enabled: draft.enabled,
              displayTitleKo: draft.draftTitleKo,
              displayTitleEn: null,
              adEnabled: draft.adEnabled ? ("true" as const) : ("false" as const),
              couponEnabled: draft.couponEnabled ? ("true" as const) : ("false" as const),
              maxInsertion: draft.draftMax.trim() === "" ? null : Number(draft.draftMax),
              intervalEveryN: Number(draft.draftInterval) || 8,
              presentationMode: "card_benefit_integrated" as const,
            };

      const res = await fetch("/api/admin/stores-category-policy", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, rows: [row] }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; revision?: number };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error === "stale_revision" ? "stale_revision" : (json.error ?? "save_fail"));
        return;
      }
      if (typeof json.revision === "number") setRevision(json.revision);
      setSaveMsg(t("admin_stores_category_save_ok"));
      await load();
    } catch {
      setSaveErr("save_fail");
    } finally {
      setSaving(false);
    }
  };

  const selectedSubDraft = selectedSub ? draftSubs[selectedSub] : null;
  const selectedSubMeta = secondaries.find((s) => s.subSlug === selectedSub) ?? null;

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_stores_category_primary_title" backHref="/admin/stores" />
      <p className="text-[13px] text-sam-muted">{t("admin_stores_category_ops_desc")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
          {t("admin_stores_category_reload")}
        </button>
      </div>
      {saveMsg ? <p className="text-[13px] text-sam-success">{saveMsg}</p> : null}
      {saveErr ?
        <p className="text-[13px] text-red-700">
          {saveErr === "stale_revision"
            ? t("admin_stores_category_stale_revision")
            : t("admin_stores_category_save_fail")}
        </p>
      : null}
      {err ? <p className="text-[13px] text-red-700">{t("admin_stores_category_save_fail")} ({err})</p> : null}

      {loading ?
        <p className="text-[13px] text-sam-muted">{t("admin_stores_home_shelves_loading")}</p>
      : (
        <div className="grid gap-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
          <aside className="rounded-ui-rect border border-sam-border bg-sam-surface p-2">
            <p className="px-2 py-1.5 text-[11px] font-semibold text-sam-muted">
              {t("admin_stores_category_col_primary")}
            </p>
            <ul className="space-y-1">
              {primaries.map((p) => {
                const active = p.primarySlug === selectedPrimary;
                return (
                  <li key={p.primarySlug}>
                    <button
                      type="button"
                      onClick={() => selectPrimary(p.primarySlug)}
                      className={`w-full rounded-ui-rect px-2 py-2 text-left text-[13px] font-medium ${
                        active ? "bg-signature/10 text-signature" : "hover:bg-sam-surface-muted"
                      }`}
                    >
                      {language === "ko" ? p.nameKo : p.nameEn}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="space-y-4">
            {!selectedPrimary || !primaryMeta || !draftPrimary ?
              <p className="text-[13px] text-sam-muted">{t("admin_stores_category_select_primary_hint")}</p>
            : <>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[15px] font-semibold text-sam-fg">
                      {`${language === "ko" ? primaryMeta.nameKo : primaryMeta.nameEn} ${t("admin_stores_category_ops_primary_suffix")}`}
                    </h2>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={Sam.btn.secondary}
                        disabled={saving}
                        onClick={() => void load()}
                      >
                        {t("admin_stores_category_cancel")}
                      </button>
                      <button
                        type="button"
                        className={Sam.btn.primary}
                        disabled={saving}
                        onClick={() => void onSavePrimary()}
                      >
                        {t("admin_stores_category_save")}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-2 text-[13px] sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={draftPrimary.enabled}
                        onChange={(e) => setDraftPrimary({ ...draftPrimary, enabled: e.target.checked })}
                      />
                      {t("admin_stores_category_col_enabled")}
                    </label>
                    <label className="block text-[12px] text-sam-muted sm:col-span-2">
                      {t("admin_stores_category_col_title")}
                      <input
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={draftPrimary.draftTitleKo}
                        onChange={(e) =>
                          setDraftPrimary({ ...draftPrimary, draftTitleKo: e.target.value })
                        }
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={draftPrimary.adEnabled}
                        onChange={(e) => setDraftPrimary({ ...draftPrimary, adEnabled: e.target.checked })}
                      />
                      {t("admin_stores_category_col_ad")}
                    </label>
                    <label className="inline-flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={draftPrimary.couponEnabled}
                        onChange={(e) =>
                          setDraftPrimary({ ...draftPrimary, couponEnabled: e.target.checked })
                        }
                      />
                      {t("admin_stores_category_col_coupon")}
                    </label>
                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_category_col_max")}
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={draftPrimary.draftMax}
                        onChange={(e) => setDraftPrimary({ ...draftPrimary, draftMax: e.target.value })}
                      />
                    </label>
                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_category_col_interval")}
                      <input
                        type="number"
                        min={2}
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={draftPrimary.draftInterval}
                        onChange={(e) =>
                          setDraftPrimary({ ...draftPrimary, draftInterval: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
                  <h3 className="mb-3 text-[13px] font-semibold">{t("admin_stores_category_preview_title")}</h3>
                  <CategoryCardPreview
                    title={draftPrimary.draftTitleKo || primaryMeta.nameKo}
                    ad={draftPrimary.adEnabled}
                    coupon={draftPrimary.couponEnabled}
                  />
                </div>

                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
                  <h3 className="mb-3 text-[14px] font-semibold">{t("admin_stores_category_secondary_title")}</h3>
                  <p className="mb-3 text-[12px] text-sam-muted">{t("admin_stores_category_secondary_ops_desc")}</p>

                  <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                    <ul className="space-y-1">
                      {secondaries.map((s) => {
                        const draft = draftSubs[s.subSlug];
                        const active = s.subSlug === selectedSub;
                        return (
                          <li key={s.subSlug}>
                            <button
                              type="button"
                              onClick={() => setSelectedSub(s.subSlug)}
                              className={`w-full rounded-ui-rect px-2 py-2 text-left text-[12px] ${
                                active ? "bg-signature/10 text-signature" : "hover:bg-sam-surface-muted"
                              }`}
                            >
                              <span className="font-medium">
                                {language === "ko" ? s.nameKo : s.nameEn}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-sam-muted">
                                {draft?.mode === "override"
                                  ? t("admin_stores_category_scope_overridden")
                                  : t("admin_stores_category_scope_inherited")}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {selectedSubMeta && selectedSubDraft ?
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={`${Sam.btn.secondary} ${selectedSubDraft.mode === "inherit" ? "ring-2 ring-signature" : ""}`}
                            onClick={() =>
                              setDraftSubs((prev) => ({
                                ...prev,
                                [selectedSubMeta.subSlug]: { ...selectedSubDraft, mode: "inherit" },
                              }))
                            }
                          >
                            {t("admin_stores_category_inherit")}
                          </button>
                          <button
                            type="button"
                            className={`${Sam.btn.secondary} ${selectedSubDraft.mode === "override" ? "ring-2 ring-signature" : ""}`}
                            onClick={() =>
                              setDraftSubs((prev) => ({
                                ...prev,
                                [selectedSubMeta.subSlug]: { ...selectedSubDraft, mode: "override" },
                              }))
                            }
                          >
                            {t("admin_stores_category_override_use")}
                          </button>
                        </div>

                        {selectedSubDraft.mode === "inherit" ?
                          <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-[12px] text-sam-muted">
                            {`${t("admin_stores_category_inherit_hint_prefix")} ${draftPrimary.adEnabled ? "ON" : "OFF"} ${t("admin_stores_category_inherit_hint_mid")} ${draftPrimary.couponEnabled ? "ON" : "OFF"}`}
                          </p>
                        : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="inline-flex items-center gap-2 text-[13px] sm:col-span-2">
                              <input
                                type="checkbox"
                                checked={selectedSubDraft.enabled}
                                onChange={(e) =>
                                  setDraftSubs((prev) => ({
                                    ...prev,
                                    [selectedSubMeta.subSlug]: {
                                      ...selectedSubDraft,
                                      enabled: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              {t("admin_stores_category_col_enabled")}
                            </label>
                            <label className="block text-[12px] text-sam-muted sm:col-span-2">
                              {t("admin_stores_category_col_title")}
                              <input
                                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px]"
                                value={selectedSubDraft.draftTitleKo}
                                onChange={(e) =>
                                  setDraftSubs((prev) => ({
                                    ...prev,
                                    [selectedSubMeta.subSlug]: {
                                      ...selectedSubDraft,
                                      draftTitleKo: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label className="inline-flex items-center gap-2 text-[13px]">
                              <input
                                type="checkbox"
                                checked={selectedSubDraft.adEnabled}
                                onChange={(e) =>
                                  setDraftSubs((prev) => ({
                                    ...prev,
                                    [selectedSubMeta.subSlug]: {
                                      ...selectedSubDraft,
                                      adEnabled: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              {t("admin_stores_category_col_ad")}
                            </label>
                            <label className="inline-flex items-center gap-2 text-[13px]">
                              <input
                                type="checkbox"
                                checked={selectedSubDraft.couponEnabled}
                                onChange={(e) =>
                                  setDraftSubs((prev) => ({
                                    ...prev,
                                    [selectedSubMeta.subSlug]: {
                                      ...selectedSubDraft,
                                      couponEnabled: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              {t("admin_stores_category_col_coupon")}
                            </label>
                            <label className="block text-[12px] text-sam-muted">
                              {t("admin_stores_category_col_max")}
                              <input
                                type="number"
                                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px]"
                                value={selectedSubDraft.draftMax}
                                onChange={(e) =>
                                  setDraftSubs((prev) => ({
                                    ...prev,
                                    [selectedSubMeta.subSlug]: {
                                      ...selectedSubDraft,
                                      draftMax: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label className="block text-[12px] text-sam-muted">
                              {t("admin_stores_category_col_interval")}
                              <input
                                type="number"
                                min={2}
                                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px]"
                                value={selectedSubDraft.draftInterval}
                                onChange={(e) =>
                                  setDraftSubs((prev) => ({
                                    ...prev,
                                    [selectedSubMeta.subSlug]: {
                                      ...selectedSubDraft,
                                      draftInterval: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          </div>
                        )}

                        <button
                          type="button"
                          className={Sam.btn.primary}
                          disabled={saving}
                          onClick={() => void onSaveSecondary(selectedSubMeta.subSlug)}
                        >
                          {t("admin_stores_category_save")}
                        </button>
                      </div>
                    : null}
                  </div>
                </div>
              </>
            }
          </section>
        </div>
      )}
    </div>
  );
}
