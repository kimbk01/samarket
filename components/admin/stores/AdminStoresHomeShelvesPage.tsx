"use client";

/**
 * HOME 관리 — 운영 CMS (선반 목록 + 상세 + preview).
 * 개발자 slot ID / 정책 테이블 UX 금지.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type {
  StoresHomeShelfAdIntegration,
  StoresHomeShelfCouponIntegration,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import type {
  StoresHomeShelfEntityType,
  StoresHomeShelfImageSource,
  StoresHomeShelfShowAllRouteKey,
} from "@/lib/stores/product/stores-home-shelf-product-config";

type DraftShelf = StoresHomeShelfResolvedConfig & { draftMax: string };

const ENTITY_OPTIONS: StoresHomeShelfEntityType[] = ["product", "store", "brand"];
const IMAGE_OPTIONS: StoresHomeShelfImageSource[] = [
  "auto",
  "store_profile",
  "representative_product",
  "campaign_creative",
  "brand_logo",
];
const ROUTE_OPTIONS: StoresHomeShelfShowAllRouteKey[] = [
  "none",
  "orderNow",
  "popular",
  "discount",
  "topRated",
  "nearby",
  "recommended",
  "allStores",
];
const PRESENTATION_BY_ENTITY: Record<StoresHomeShelfEntityType, StoresHomePresentationPatternId[]> = {
  product: ["food_horizontal", "editorial_grid", "high_rating_horizontal"],
  store: ["store_horizontal", "timesale_vertical", "store_teaser_horizontal", "high_rating_horizontal"],
  brand: ["brand_circular"],
};
const COUPON_OPTIONS: StoresHomeShelfCouponIntegration[] = ["off", "badge_on_image", "benefit_line", "both"];
const AD_OPTIONS: StoresHomeShelfAdIntegration[] = ["off", "sponsored_badge", "benefit_line", "both"];

function HomeShelfPreview({ shelf }: { shelf: DraftShelf }) {
  const { t } = useI18n();
  const entity = shelf.productConfig.entityType;
  const showAll = shelf.productConfig.showAllEnabled;

  return (
    <div
      className="rounded-ui-rect border border-sam-border bg-sam-app p-3"
      data-admin-home-shelf-preview={shelf.shelfId}
      data-preview-entity={entity}
      data-preview-presentation={shelf.presentation}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-sam-fg">{shelf.titleKo}</p>
          {shelf.subtitleKo ?
            <p className="truncate text-[12px] text-sam-muted">{shelf.subtitleKo}</p>
          : null}
        </div>
        {showAll ?
          <span className="shrink-0 text-[12px] font-medium text-signature">
            {shelf.productConfig.showAllLabelKo?.trim() || t("store_browse_view_all")} ›
          </span>
        : null}
      </div>

      {entity === "brand" ?
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <div className="h-14 w-14 rounded-full bg-sam-surface-muted ring-1 ring-sam-border" />
              <div className="h-2 w-12 rounded bg-sam-surface-muted" />
              <div className="h-2 w-10 rounded bg-signature/20" />
            </div>
          ))}
        </div>
      : entity === "product" ?
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[7.5rem] shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
              <div className="aspect-square bg-sam-surface-muted" />
              <div className="space-y-1 p-2">
                <div className="h-2.5 w-full rounded bg-sam-surface-muted" />
                <div className="h-2.5 w-1/2 rounded bg-signature/30" />
                <div className="h-2 w-2/3 rounded bg-sam-surface-muted" />
              </div>
            </div>
          ))}
        </div>
      : shelf.presentation === "timesale_vertical" ?
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2.5 border-b border-sam-border/60 pb-2">
              <div className="h-[71px] w-[75px] shrink-0 rounded-[6px] bg-sam-surface-muted" />
              <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                <div className="h-3 w-3/4 rounded bg-sam-surface-muted" />
                <div className="h-2.5 w-1/2 rounded bg-sam-surface-muted" />
                <div className="h-2.5 w-2/3 rounded bg-sam-surface-muted" />
              </div>
            </div>
          ))}
        </div>
      : (
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[9.5rem] shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
              <div className="relative aspect-[4/3] bg-sam-surface-muted">
                {shelf.couponIntegration !== "off" ?
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-signature px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {t("store_badge_coupon")}
                  </span>
                : null}
                {shelf.adIntegration !== "off" ?
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {t("store_insertion_sponsored")}
                  </span>
                : null}
              </div>
              <div className="space-y-1 p-2">
                <div className="h-2.5 w-full rounded bg-sam-surface-muted" />
                <div className="h-2 w-1/3 rounded bg-sam-surface-muted" />
                {(shelf.couponIntegration === "benefit_line" || shelf.couponIntegration === "both") ?
                  <div className="h-2 w-2/3 rounded bg-signature/25" />
                : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminStoresHomeShelvesPage() {
  const { t, language } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [rows, setRows] = useState<DraftShelf[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<DraftShelf[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/stores-home-shelves", { credentials: "include", cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        shelves?: StoresHomeShelfResolvedConfig[];
        revision?: number;
      };
      if (!res.ok || !json.ok || !json.shelves) {
        setErr(json.error ?? "load_fail");
        setRows([]);
        setRevision(null);
        return;
      }
      setRevision(typeof json.revision === "number" ? json.revision : 0);
      const mapped = json.shelves.map((s) => ({
        ...s,
        draftMax: s.max == null ? "" : String(s.max),
      }));
      setRows(mapped);
      setBaseline(JSON.parse(JSON.stringify(mapped)) as DraftShelf[]);
      setSelectedId((prev) => prev ?? mapped.find((s) => s.availability !== "unavailable")?.shelfId ?? null);
    } catch {
      setErr("load_fail");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.order - b.order), [rows]);
  const selected = sorted.find((s) => s.shelfId === selectedId) ?? null;
  const presentationOptions = selected
    ? PRESENTATION_BY_ENTITY[selected.productConfig.entityType]
    : PRESENTATION_BY_ENTITY.store;

  const update = (shelfId: string, patch: Partial<DraftShelf>) => {
    setRows((prev) => prev.map((r) => (r.shelfId === shelfId ? { ...r, ...patch } : r)));
  };

  const onCancel = () => {
    setRows(JSON.parse(JSON.stringify(baseline)) as DraftShelf[]);
    setSaveMsg(null);
    setSaveErr(null);
  };

  const onSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      if (revision == null) {
        setSaveErr("save_fail");
        return;
      }
      const editable = rows.filter((r) => r.availability !== "unavailable");
      const res = await fetch("/api/admin/stores-home-shelves", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          shelves: editable.map((r) => ({
            shelfId: r.shelfId,
            enabled: r.enabled,
            order: r.order,
            max: r.draftMax.trim() === "" ? null : Number(r.draftMax),
            titleKo: r.titleKo,
            titleEn: r.titleEn,
            subtitleKo: r.subtitleKo,
            subtitleEn: r.subtitleEn,
            presentation: r.presentation,
            couponIntegration: r.couponIntegration,
            adIntegration: r.adIntegration,
            scheduleStart: r.scheduleStart,
            scheduleEnd: r.scheduleEnd,
            productConfig: r.productConfig,
          })),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; revision?: number };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error === "stale_revision" ? "stale_revision" : (json.error ?? "save_fail"));
        return;
      }
      if (typeof json.revision === "number") setRevision(json.revision);
      setSaveMsg(t("admin_stores_home_shelves_save_ok"));
      await load();
    } catch {
      setSaveErr("save_fail");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_stores_home_shelves_title" backHref="/admin/stores" />
      <p className="text-[13px] text-sam-muted">{t("admin_stores_home_shelves_desc")}</p>
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        {t("admin_stores_home_shelves_ranking_lock")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
          {t("admin_stores_home_shelves_reload")}
        </button>
        <button type="button" className={Sam.btn.secondary} onClick={onCancel} disabled={loading || saving}>
          {t("admin_stores_home_shelves_cancel")}
        </button>
        <button type="button" className={Sam.btn.primary} onClick={() => void onSave()} disabled={saving || loading}>
          {t("admin_stores_home_shelves_save")}
        </button>
      </div>

      {saveMsg ? <p className="text-[13px] text-sam-success">{saveMsg}</p> : null}
      {saveErr ?
        <p className="text-[13px] text-red-700">
          {saveErr === "stale_revision"
            ? t("admin_stores_home_shelves_stale_revision")
            : t("admin_stores_home_shelves_save_fail")}
        </p>
      : null}
      {err ? <p className="text-[13px] text-red-700">{t("admin_stores_home_shelves_save_fail")} ({err})</p> : null}

      {loading ?
        <p className="text-[13px] text-sam-muted">{t("admin_stores_home_shelves_loading")}</p>
      : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
          <aside className="rounded-ui-rect border border-sam-border bg-sam-surface p-2">
            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sam-muted">
              {t("admin_stores_home_shelves_list_title")}
            </p>
            <ul className="space-y-1">
              {sorted.map((row) => {
                const unavailable = row.availability === "unavailable";
                const name = language === "ko" ? row.titleKo : row.titleEn;
                const active = row.shelfId === selectedId;
                return (
                  <li key={row.shelfId}>
                    <button
                      type="button"
                      disabled={unavailable}
                      onClick={() => setSelectedId(row.shelfId)}
                      className={`flex w-full items-center gap-2 rounded-ui-rect px-2 py-2 text-left text-[13px] ${
                        active ? "bg-signature/10 text-signature" : "hover:bg-sam-surface-muted"
                      } ${unavailable ? "opacity-50" : ""}`}
                    >
                      <span className="w-6 shrink-0 text-[11px] text-sam-muted">{row.order}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${row.enabled && !unavailable ? "bg-sam-success" : "bg-sam-border"}`}
                      />
                    </button>
                    {unavailable ?
                      <p className="px-8 pb-1 text-[10px] text-sam-muted">
                        {language === "ko" ? row.unavailableReasonKo : row.unavailableReasonEn}
                      </p>
                    : null}
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="space-y-4">
            {selected && selected.availability !== "unavailable" ?
              <>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[15px] font-semibold text-sam-fg">
                      {language === "ko" ? selected.titleKo : selected.titleEn}
                    </h2>
                    <label className="inline-flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={selected.enabled}
                        onChange={(e) => update(selected.shelfId, { enabled: e.target.checked })}
                      />
                      {t("admin_stores_home_shelves_col_enabled")}
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_order")}
                      <input
                        type="number"
                        min={0}
                        max={99}
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={selected.order}
                        onChange={(e) => update(selected.shelfId, { order: Number(e.target.value) })}
                      />
                    </label>
                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_max")}
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        placeholder="∞"
                        value={selected.draftMax}
                        onChange={(e) => update(selected.shelfId, { draftMax: e.target.value })}
                      />
                    </label>
                    <label className="block text-[12px] text-sam-muted sm:col-span-2">
                      {t("admin_stores_home_shelves_col_title_ko")}
                      <input
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={selected.titleKo}
                        onChange={(e) => update(selected.shelfId, { titleKo: e.target.value })}
                      />
                    </label>
                    <label className="block text-[12px] text-sam-muted sm:col-span-2">
                      {t("admin_stores_home_shelves_col_title_en")}
                      <input
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={selected.titleEn}
                        onChange={(e) => update(selected.shelfId, { titleEn: e.target.value })}
                      />
                    </label>
                    <label className="block text-[12px] text-sam-muted sm:col-span-2">
                      {t("admin_stores_home_shelves_col_subtitle_ko")}
                      <input
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={selected.subtitleKo ?? ""}
                        onChange={(e) => update(selected.shelfId, { subtitleKo: e.target.value || null })}
                      />
                    </label>

                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_entity")}
                      <select
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={selected.productConfig.entityType}
                        onChange={(e) => {
                          const entityType = e.target.value as StoresHomeShelfEntityType;
                          const nextPres = PRESENTATION_BY_ENTITY[entityType][0]!;
                          update(selected.shelfId, {
                            productConfig: { ...selected.productConfig, entityType },
                            presentation: nextPres,
                          });
                        }}
                      >
                        {ENTITY_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {t(`admin_stores_home_shelves_entity_${p}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_presentation")}
                      <select
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={selected.presentation}
                        onChange={(e) =>
                          update(selected.shelfId, {
                            presentation: e.target.value as StoresHomePresentationPatternId,
                          })
                        }
                      >
                        {presentationOptions.map((p) => (
                          <option key={p} value={p}>
                            {t(`admin_stores_home_shelves_pres_${p}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_image")}
                      <select
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg"
                        value={selected.productConfig.imageSource}
                        onChange={(e) =>
                          update(selected.shelfId, {
                            productConfig: {
                              ...selected.productConfig,
                              imageSource: e.target.value as StoresHomeShelfImageSource,
                            },
                          })
                        }
                      >
                        {IMAGE_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {t(`admin_stores_home_shelves_image_${p}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_show_all")}
                      <div className="mt-1 flex flex-col gap-2">
                        <label className="inline-flex items-center gap-2 text-[13px] text-sam-fg">
                          <input
                            type="checkbox"
                            checked={selected.productConfig.showAllEnabled}
                            onChange={(e) =>
                              update(selected.shelfId, {
                                productConfig: {
                                  ...selected.productConfig,
                                  showAllEnabled: e.target.checked,
                                },
                              })
                            }
                          />
                          {t("admin_stores_home_shelves_show_all_on")}
                        </label>
                        <select
                          disabled={!selected.productConfig.showAllEnabled}
                          className="rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg disabled:opacity-50"
                          value={selected.productConfig.showAllRouteKey}
                          onChange={(e) =>
                            update(selected.shelfId, {
                              productConfig: {
                                ...selected.productConfig,
                                showAllRouteKey: e.target.value as StoresHomeShelfShowAllRouteKey,
                              },
                            })
                          }
                        >
                          {ROUTE_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {t(`admin_stores_home_shelves_route_${p}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_coupon")}
                      <select
                        disabled={!selected.supportsCouponIntegration}
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg disabled:opacity-50"
                        value={selected.couponIntegration}
                        onChange={(e) =>
                          update(selected.shelfId, {
                            couponIntegration: e.target.value as StoresHomeShelfCouponIntegration,
                          })
                        }
                      >
                        {COUPON_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p === "off"
                              ? t("admin_stores_home_shelves_integration_off")
                              : p === "badge_on_image"
                                ? t("admin_stores_home_shelves_integration_badge")
                                : p === "benefit_line"
                                  ? t("admin_stores_home_shelves_integration_benefit")
                                  : t("admin_stores_home_shelves_integration_both")}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[12px] text-sam-muted">
                      {t("admin_stores_home_shelves_col_ad")}
                      <select
                        disabled={!selected.supportsAdIntegration}
                        className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-[13px] text-sam-fg disabled:opacity-50"
                        value={selected.adIntegration}
                        onChange={(e) =>
                          update(selected.shelfId, {
                            adIntegration: e.target.value as StoresHomeShelfAdIntegration,
                          })
                        }
                      >
                        {AD_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p === "off"
                              ? t("admin_stores_home_shelves_integration_off")
                              : p === "sponsored_badge"
                                ? t("admin_stores_home_shelves_integration_badge")
                                : p === "benefit_line"
                                  ? t("admin_stores_home_shelves_integration_benefit")
                                  : t("admin_stores_home_shelves_integration_both")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
                  <h3 className="mb-3 text-[13px] font-semibold text-sam-fg">
                    {t("admin_stores_home_shelves_preview_title")}
                  </h3>
                  <HomeShelfPreview shelf={selected} />
                </div>
              </>
            : (
              <p className="text-[13px] text-sam-muted">{t("admin_stores_home_shelves_select_hint")}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
