"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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

type EditableShelf = StoresHomeShelfResolvedConfig & {
  draftMax: string;
};

const PRESENTATION_OPTIONS: StoresHomePresentationPatternId[] = [
  "timesale_vertical",
  "food_horizontal",
  "store_horizontal",
  "high_rating_horizontal",
  "brand_circular",
  "store_teaser_horizontal",
  "editorial_grid",
  "preserved_legacy",
];

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
const COUPON_OPTIONS: StoresHomeShelfCouponIntegration[] = [
  "off",
  "badge_on_image",
  "benefit_line",
  "both",
];

const AD_OPTIONS: StoresHomeShelfAdIntegration[] = ["off", "sponsored_badge", "benefit_line", "both"];

function statusLabelKey(availability: EditableShelf["availability"]) {
  if (availability === "available") return "admin_stores_home_shelves_status_available";
  if (availability === "partial") return "admin_stores_home_shelves_status_partial";
  return "admin_stores_home_shelves_status_unavailable";
}

export function AdminStoresHomeShelvesPage() {
  const { t, language } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [rows, setRows] = useState<EditableShelf[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/stores-home-shelves", {
        credentials: "include",
        cache: "no-store",
      });
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
      setRows(
        json.shelves.map((s) => ({
          ...s,
          draftMax: s.max == null ? "" : String(s.max),
        }))
      );
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

  const sortedRows = useMemo(() => [...rows].sort((a, b) => a.order - b.order), [rows]);

  const updateRow = (shelfId: string, patch: Partial<EditableShelf>) => {
    setRows((prev) => prev.map((r) => (r.shelfId === shelfId ? { ...r, ...patch } : r)));
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
      const payload = {
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
      };
      const res = await fetch("/api/admin/stores-home-shelves", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        revision?: number;
      };
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
        <button type="button" className={Sam.btn.primary} onClick={() => void onSave()} disabled={saving || loading}>
          {t("admin_stores_home_shelves_save")}
        </button>
      </div>

      <AdminCard titleKey="admin_stores_home_shelves_title">
        {loading ?
          <p className="text-[13px] text-sam-muted">{t("admin_stores_home_shelves_loading")}</p>
        : err ?
          <p className="text-[13px] text-red-700">{t("admin_stores_home_shelves_save_fail")} ({err})</p>
        : <>
            {saveMsg ? <p className="mb-2 text-[13px] text-sam-success">{saveMsg}</p> : null}
            {saveErr ?
              <p className="mb-2 text-[13px] text-red-700">
                {saveErr === "stale_revision"
                  ? t("admin_stores_home_shelves_stale_revision")
                  : t("admin_stores_home_shelves_save_fail")}
              </p>
            : null}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-sam-border text-sam-muted">
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_name")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_status")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_enabled")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_order")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_title_ko")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_title_en")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_subtitle_ko")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_max")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_presentation")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_entity")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_show_all")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_image")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_coupon")}</th>
                    <th className="px-2 py-2">{t("admin_stores_home_shelves_col_ad")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const unavailable = row.availability === "unavailable";
                    const displayName = language === "ko" ? row.titleKo : row.titleEn;
                    const reason =
                      language === "ko" ? row.unavailableReasonKo : row.unavailableReasonEn;
                    return (
                      <tr
                        key={row.shelfId}
                        className={unavailable ? "border-b border-sam-border/60 bg-sam-surface-muted/60" : "border-b border-sam-border/60"}
                      >
                        <td className="px-2 py-2 font-medium text-sam-fg">{displayName}</td>
                        <td className="px-2 py-2">
                          <span className={unavailable ? "text-sam-muted" : "text-sam-fg"}>
                            {t(statusLabelKey(row.availability))}
                          </span>
                          {unavailable && reason ?
                            <p className="mt-1 max-w-[14rem] text-[10px] text-sam-muted">{reason}</p>
                          : null}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            disabled={unavailable}
                            onChange={(e) => updateRow(row.shelfId, { enabled: e.target.checked })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            max={99}
                            disabled={unavailable}
                            className="w-16 rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.order}
                            onChange={(e) => updateRow(row.shelfId, { order: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            disabled={unavailable}
                            className="min-w-[8rem] rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.titleKo}
                            onChange={(e) => updateRow(row.shelfId, { titleKo: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            disabled={unavailable}
                            className="min-w-[8rem] rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.titleEn}
                            onChange={(e) => updateRow(row.shelfId, { titleEn: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            disabled={unavailable}
                            className="min-w-[8rem] rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.subtitleKo ?? ""}
                            onChange={(e) => updateRow(row.shelfId, { subtitleKo: e.target.value || null })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            disabled={unavailable}
                            className="w-20 rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            placeholder="∞"
                            value={row.draftMax}
                            onChange={(e) => updateRow(row.shelfId, { draftMax: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            disabled={unavailable}
                            className="rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.presentation}
                            onChange={(e) =>
                              updateRow(row.shelfId, {
                                presentation: e.target.value as StoresHomePresentationPatternId,
                              })
                            }
                          >
                            {PRESENTATION_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {t(`admin_stores_home_shelves_pres_${p}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            disabled={unavailable}
                            className="rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.productConfig.entityType}
                            onChange={(e) =>
                              updateRow(row.shelfId, {
                                productConfig: {
                                  ...row.productConfig,
                                  entityType: e.target.value as StoresHomeShelfEntityType,
                                },
                              })
                            }
                          >
                            {ENTITY_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {t(`admin_stores_home_shelves_entity_${p}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-1">
                            <label className="inline-flex items-center gap-1">
                              <input
                                type="checkbox"
                                disabled={unavailable}
                                checked={row.productConfig.showAllEnabled}
                                onChange={(e) =>
                                  updateRow(row.shelfId, {
                                    productConfig: {
                                      ...row.productConfig,
                                      showAllEnabled: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>{t("admin_stores_home_shelves_show_all_on")}</span>
                            </label>
                            <select
                              disabled={unavailable || !row.productConfig.showAllEnabled}
                              className="rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                              value={row.productConfig.showAllRouteKey}
                              onChange={(e) =>
                                updateRow(row.shelfId, {
                                  productConfig: {
                                    ...row.productConfig,
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
                        </td>
                        <td className="px-2 py-2">
                          <select
                            disabled={unavailable}
                            className="rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.productConfig.imageSource}
                            onChange={(e) =>
                              updateRow(row.shelfId, {
                                productConfig: {
                                  ...row.productConfig,
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
                        </td>
                        <td className="px-2 py-2">
                          <select
                            disabled={unavailable || !row.supportsCouponIntegration}
                            className="rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.couponIntegration}
                            onChange={(e) =>
                              updateRow(row.shelfId, {
                                couponIntegration: e.target.value as StoresHomeShelfCouponIntegration,
                              })
                            }
                          >
                            {COUPON_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            disabled={unavailable || !row.supportsAdIntegration}
                            className="rounded border border-sam-border px-1 py-0.5 disabled:opacity-50"
                            value={row.adIntegration}
                            onChange={(e) =>
                              updateRow(row.shelfId, {
                                adIntegration: e.target.value as StoresHomeShelfAdIntegration,
                              })
                            }
                          >
                            {AD_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-sam-muted">{t("admin_stores_home_shelves_unavailable_hint")}</p>
          </>
        }
      </AdminCard>
    </div>
  );
}
