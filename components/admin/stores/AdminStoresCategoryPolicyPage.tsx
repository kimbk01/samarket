"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { StoresBrowseScopePolicyResolved, StoresBrowseScopePolicyRow } from "@/lib/stores/product/stores-browse-scope-policy-catalog";

type PrimaryRow = {
  primarySlug: string;
  nameKo: string;
  nameEn: string;
  scopeKey: string;
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

type DraftPrimary = PrimaryRow & {
  draftTitleKo: string;
  draftTitleEn: string;
  draftMax: string;
  draftInterval: string;
  adEnabled: boolean;
  couponEnabled: boolean;
};

type DraftSecondary = SecondaryRow & {
  draftTitleKo: string;
  adMode: "inherit" | "true" | "false";
  couponMode: "inherit" | "true" | "false";
  draftMax: string;
  draftInterval: string;
};

export function AdminStoresCategoryPolicyPage() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const selectedPrimary = searchParams.get("primary")?.trim().toLowerCase() ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [primaries, setPrimaries] = useState<DraftPrimary[]>([]);
  const [secondaries, setSecondaries] = useState<DraftSecondary[]>([]);

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
      setPrimaries(
        json.primaries.map((p) => ({
          ...p,
          draftTitleKo: p.resolved.displayTitleKo ?? p.nameKo,
          draftTitleEn: p.resolved.displayTitleEn ?? p.nameEn,
          draftMax: p.resolved.maxInsertion == null ? "" : String(p.resolved.maxInsertion),
          draftInterval: String(p.resolved.intervalEveryN),
          adEnabled: p.resolved.adEnabled,
          couponEnabled: p.resolved.couponEnabled,
        }))
      );
      setSecondaries(
        (json.secondary ?? []).map((s) => {
          const adRaw = s.row?.adEnabled;
          const couponRaw = s.row?.couponEnabled;
          const maxRaw = s.row?.maxInsertion;
          const intervalRaw = s.row?.intervalEveryN;
          return {
            ...s,
            draftTitleKo: s.resolved.displayTitleKo ?? s.nameKo,
            adMode:
              adRaw === "inherit" || adRaw == null ? "inherit" : adRaw === true ? "true" : "false",
            couponMode:
              couponRaw === "inherit" || couponRaw == null
                ? "inherit"
                : couponRaw === true
                  ? "true"
                  : "false",
            draftMax:
              maxRaw === "inherit" || maxRaw == null
                ? ""
                : maxRaw == null
                  ? ""
                  : String(maxRaw),
            draftInterval:
              intervalRaw === "inherit" || intervalRaw == null
                ? ""
                : intervalRaw == null
                  ? ""
                  : String(intervalRaw),
          };
        })
      );
    } catch {
      setErr("load_fail");
    } finally {
      setLoading(false);
    }
  }, [selectedPrimary]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPrimaryRow = useMemo(
    () => primaries.find((p) => p.primarySlug === selectedPrimary),
    [primaries, selectedPrimary]
  );

  const updatePrimary = (slug: string, patch: Partial<DraftPrimary>) => {
    setPrimaries((prev) => prev.map((p) => (p.primarySlug === slug ? { ...p, ...patch } : p)));
  };

  const updateSecondary = (subSlug: string, patch: Partial<DraftSecondary>) => {
    setSecondaries((prev) => prev.map((s) => (s.subSlug === subSlug ? { ...s, ...patch } : s)));
  };

  const onSavePrimary = async (row: DraftPrimary) => {
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    if (revision == null) {
      setSaveErr("save_fail");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/stores-category-policy", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          rows: [
            {
              scopeKey: row.scopeKey,
              primarySlug: row.primarySlug,
              subSlug: null,
              enabled: true,
              displayTitleKo: row.draftTitleKo,
              displayTitleEn: row.draftTitleEn,
              adEnabled: row.adEnabled ? "true" : "false",
              couponEnabled: row.couponEnabled ? "true" : "false",
              maxInsertion: row.draftMax.trim() === "" ? null : Number(row.draftMax),
              intervalEveryN: Number(row.draftInterval) || 8,
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

  const onSaveSecondary = async (row: DraftSecondary) => {
    if (!selectedPrimary) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    if (revision == null) {
      setSaveErr("save_fail");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/stores-category-policy", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          rows: [
            {
              scopeKey: row.scopeKey,
              primarySlug: selectedPrimary,
              subSlug: row.subSlug,
              enabled: true,
              displayTitleKo: row.draftTitleKo,
              adEnabled: row.adMode,
              couponEnabled: row.couponMode,
              maxInsertion: row.draftMax.trim() === "" ? null : Number(row.draftMax),
              intervalEveryN: row.draftInterval.trim() === "" ? null : Number(row.draftInterval),
              presentationMode: "inherit",
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

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_stores_category_primary_title" backHref="/admin/stores" />
      <p className="text-[13px] text-sam-muted">{t("admin_stores_category_primary_desc")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
          {t("admin_stores_category_reload")}
        </button>
      </div>

      <AdminCard titleKey="admin_stores_category_primary_title">
        {loading ?
          <p className="text-[13px] text-sam-muted">{t("admin_stores_home_shelves_loading")}</p>
        : err ?
          <p className="text-[13px] text-red-700">{t("admin_stores_category_save_fail")} ({err})</p>
        : <>
            {saveMsg ? <p className="mb-2 text-[13px] text-sam-success">{saveMsg}</p> : null}
            {saveErr ?
              <p className="mb-2 text-[13px] text-red-700">
                {saveErr === "stale_revision"
                  ? t("admin_stores_category_stale_revision")
                  : t("admin_stores_category_save_fail")}
              </p>
            : null}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-sam-border text-sam-muted">
                    <th className="px-2 py-2">{t("admin_stores_category_col_primary")}</th>
                    <th className="px-2 py-2">{t("admin_stores_category_col_title")}</th>
                    <th className="px-2 py-2">{t("admin_stores_category_col_ad")}</th>
                    <th className="px-2 py-2">{t("admin_stores_category_col_coupon")}</th>
                    <th className="px-2 py-2">{t("admin_stores_category_col_max")}</th>
                    <th className="px-2 py-2">{t("admin_stores_category_col_interval")}</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {primaries.map((row) => (
                    <tr key={row.primarySlug} className="border-b border-sam-border/60">
                      <td className="px-2 py-2 font-medium">
                        {language === "ko" ? row.nameKo : row.nameEn}
                        <div className="text-[10px] text-sam-muted">{row.primarySlug}</div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="min-w-[8rem] rounded border border-sam-border px-1 py-0.5"
                          value={row.draftTitleKo}
                          onChange={(e) => updatePrimary(row.primarySlug, { draftTitleKo: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={row.adEnabled}
                          onChange={(e) => updatePrimary(row.primarySlug, { adEnabled: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={row.couponEnabled}
                          onChange={(e) =>
                            updatePrimary(row.primarySlug, { couponEnabled: e.target.checked })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="w-16 rounded border border-sam-border px-1 py-0.5"
                          value={row.draftMax}
                          onChange={(e) => updatePrimary(row.primarySlug, { draftMax: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={2}
                          className="w-16 rounded border border-sam-border px-1 py-0.5"
                          value={row.draftInterval}
                          onChange={(e) =>
                            updatePrimary(row.primarySlug, { draftInterval: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className={Sam.btn.secondary}
                            disabled={saving}
                            onClick={() => void onSavePrimary(row)}
                          >
                            {t("admin_stores_category_save")}
                          </button>
                          <Link
                            href={`/admin/stores-category-policy?primary=${encodeURIComponent(row.primarySlug)}`}
                            className={`${Sam.btn.secondary} text-center`}
                          >
                            {t("admin_stores_category_manage_sub")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        }
      </AdminCard>

      {selectedPrimary && selectedPrimaryRow ?
        <AdminCard titleKey="admin_stores_category_secondary_title">
          <p className="mb-3 text-[13px] text-sam-muted">
            {t("admin_stores_category_secondary_desc")} — {selectedPrimaryRow.nameKo}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="px-2 py-2">{t("admin_stores_category_col_sub")}</th>
                  <th className="px-2 py-2">{t("admin_stores_category_col_title")}</th>
                  <th className="px-2 py-2">{t("admin_stores_category_col_ad")}</th>
                  <th className="px-2 py-2">{t("admin_stores_category_col_coupon")}</th>
                  <th className="px-2 py-2">{t("admin_stores_category_col_max")}</th>
                  <th className="px-2 py-2">{t("admin_stores_category_col_interval")}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {secondaries.map((row) => (
                  <tr key={row.subSlug} className="border-b border-sam-border/60">
                    <td className="px-2 py-2 font-medium">
                      {language === "ko" ? row.nameKo : row.nameEn}
                      <div className="text-[10px] text-sam-muted">{row.subSlug}</div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="min-w-[8rem] rounded border border-sam-border px-1 py-0.5"
                        value={row.draftTitleKo}
                        onChange={(e) => updateSecondary(row.subSlug, { draftTitleKo: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="rounded border border-sam-border px-1 py-0.5"
                        value={row.adMode}
                        onChange={(e) =>
                          updateSecondary(row.subSlug, {
                            adMode: e.target.value as DraftSecondary["adMode"],
                          })
                        }
                      >
                        <option value="inherit">{t("admin_stores_category_inherit")}</option>
                        <option value="true">{t("admin_stores_category_override_on")}</option>
                        <option value="false">{t("admin_stores_category_override_off")}</option>
                      </select>
                      {row.adMode === "inherit" ?
                        <p className="mt-0.5 text-[10px] text-sam-muted">
                          {t("admin_stores_category_scope_inherited")} → {row.resolved.adEnabled ? "ON" : "OFF"}
                        </p>
                      : (
                        <p className="mt-0.5 text-[10px] font-medium text-signature">
                          {t("admin_stores_category_scope_overridden")}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="rounded border border-sam-border px-1 py-0.5"
                        value={row.couponMode}
                        onChange={(e) =>
                          updateSecondary(row.subSlug, {
                            couponMode: e.target.value as DraftSecondary["couponMode"],
                          })
                        }
                      >
                        <option value="inherit">{t("admin_stores_category_inherit")}</option>
                        <option value="true">{t("admin_stores_category_override_on")}</option>
                        <option value="false">{t("admin_stores_category_override_off")}</option>
                      </select>
                      {row.couponMode === "inherit" ?
                        <p className="mt-0.5 text-[10px] text-sam-muted">
                          {t("admin_stores_category_scope_inherited")} → {row.resolved.couponEnabled ? "ON" : "OFF"}
                        </p>
                      : (
                        <p className="mt-0.5 text-[10px] font-medium text-signature">
                          {t("admin_stores_category_scope_overridden")}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        placeholder={t("admin_stores_category_inherit")}
                        className="w-16 rounded border border-sam-border px-1 py-0.5"
                        value={row.draftMax}
                        onChange={(e) => updateSecondary(row.subSlug, { draftMax: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={2}
                        placeholder={t("admin_stores_category_inherit")}
                        className="w-16 rounded border border-sam-border px-1 py-0.5"
                        value={row.draftInterval}
                        onChange={(e) =>
                          updateSecondary(row.subSlug, { draftInterval: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={Sam.btn.secondary}
                        disabled={saving}
                        onClick={() => void onSaveSecondary(row)}
                      >
                        {t("admin_stores_category_save")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      : null}
    </div>
  );
}
