"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { StoresCompositionSurface } from "@/lib/stores/composition/stores-composition-contract";

type PolicyRow = {
  surface: StoresCompositionSurface;
  slot: string;
  contentType: string;
  enabled: boolean;
  order: number;
  max: number | null;
  interval: { consumed: false; reason: "NOT_CONSUMED" };
};

type EditableRow = PolicyRow & { draftMax: string };

const FUTURE_BROWSE_SLOTS = new Set([
  "future_ad_insertion",
  "future_coupon_insertion",
  "future_promoted_placement",
]);

export function AdminStoresCompositionPolicyPage() {
  const { t } = useI18n();
  const [surface, setSurface] = useState<StoresCompositionSurface>("home");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [overrideCount, setOverrideCount] = useState(0);
  const [revision, setRevision] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/stores-composition-policy?surface=${surface}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: PolicyRow[];
        overrideCount?: number;
        revision?: number;
      };
      if (!res.ok || !json.ok || !json.rows) {
        setErr(json.error ?? "load_fail");
        setRows([]);
        setRevision(null);
        return;
      }
      setOverrideCount(json.overrideCount ?? 0);
      setRevision(typeof json.revision === "number" ? json.revision : 0);
      setRows(
        json.rows.map((r) => ({
          ...r,
          interval: { consumed: false as const, reason: "NOT_CONSUMED" as const },
          draftMax: r.max == null ? "" : String(r.max),
        }))
      );
    } catch {
      setErr("load_fail");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [surface]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.order - b.order),
    [rows]
  );

  const updateRow = (slot: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r) => (r.slot === slot ? { ...r, ...patch } : r)));
  };

  const onSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    setErr(null);
    try {
      if (revision == null) {
        setSaveErr("save_fail");
        return;
      }
      const payload = {
        surface,
        expectedRevision: revision,
        rows: rows.map((r) => ({
          surface: r.surface,
          slot: r.slot,
          contentType: r.contentType,
          enabled: r.enabled,
          order: r.order,
          max: r.draftMax.trim() === "" ? null : Number(r.draftMax),
          interval: { consumed: false, reason: "NOT_CONSUMED" },
        })),
      };
      const res = await fetch("/api/admin/stores-composition-policy", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        revision?: number;
        currentRevision?: number;
      };
      if (!res.ok || !json.ok) {
        if (res.status === 409 && json.error === "stale_revision") {
          setSaveErr("stale_revision");
          return;
        }
        setSaveErr(json.error ?? "save_fail");
        return;
      }
      if (typeof json.revision === "number") {
        setRevision(json.revision);
      }
      setSaveMsg(t("admin_stores_composition_save_ok"));
      await load();
    } catch {
      setSaveErr("save_fail");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_stores_composition_title" backHref="/admin/stores" />
      <p className="text-[13px] text-sam-muted">{t("admin_stores_composition_desc")}</p>
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        {t("admin_stores_composition_ranking_lock")}
      </p>
      <p className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 text-[12px] text-sam-muted">
        {t("admin_stores_composition_engine_notice")}
      </p>
      <p className="text-[12px] text-sam-muted">{t("admin_stores_composition_title_editability")}</p>

      <div className="flex flex-wrap items-center gap-2">
        {(["home", "browse"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={surface === s ? Sam.btn.primary : Sam.btn.secondary}
            onClick={() => setSurface(s)}
          >
            {s === "home"
              ? t("admin_stores_composition_surface_home")
              : t("admin_stores_composition_surface_browse")}
          </button>
        ))}
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
          {t("admin_stores_composition_reload")}
        </button>
        <button type="button" className={Sam.btn.primary} onClick={() => void onSave()} disabled={saving || loading}>
          {t("admin_stores_composition_save")}
        </button>
        <span className="text-[12px] text-sam-muted">
          overrides: {overrideCount}
        </span>
      </div>

      <AdminCard titleKey="admin_stores_composition_title">
        {loading ?
          <p className="text-[13px] text-sam-muted">{t("admin_stores_composition_loading")}</p>
        : err ?
          <p className="text-[13px] text-red-700">{t("admin_stores_composition_load_fail")} ({err})</p>
        : <>
            {saveMsg ? <p className="mb-2 text-[13px] text-sam-success">{saveMsg}</p> : null}
            {saveErr ?
              <p className="mb-2 text-[13px] text-red-700">
                {saveErr === "stale_revision"
                  ? t("admin_stores_composition_stale_revision")
                  : t("admin_stores_composition_save_fail")}
              </p>
            : null}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-sam-border text-sam-muted">
                    <th className="px-2 py-2">{t("admin_stores_composition_col_slot")}</th>
                    <th className="px-2 py-2">{t("admin_stores_composition_col_content_type")}</th>
                    <th className="px-2 py-2">{t("admin_stores_composition_col_enabled")}</th>
                    <th className="px-2 py-2">{t("admin_stores_composition_col_order")}</th>
                    <th className="px-2 py-2">{t("admin_stores_composition_col_max")}</th>
                    <th className="px-2 py-2">{t("admin_stores_composition_col_interval")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.slot} className="border-b border-sam-border/60">
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {row.slot}
                        {FUTURE_BROWSE_SLOTS.has(row.slot) ?
                          <div className="mt-1 text-[10px] text-amber-700">
                            {t("admin_stores_composition_future_slot_notice")}
                          </div>
                        : null}
                      </td>
                      <td className="px-2 py-2">{row.contentType}</td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) => updateRow(row.slot, { enabled: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          max={99}
                          className="w-16 rounded border border-sam-border px-1 py-0.5"
                          value={row.order}
                          onChange={(e) =>
                            updateRow(row.slot, { order: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="w-20 rounded border border-sam-border px-1 py-0.5"
                          placeholder={t("admin_stores_composition_unbounded")}
                          value={row.draftMax}
                          onChange={(e) => updateRow(row.slot, { draftMax: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2 text-sam-muted">
                        {t("admin_stores_composition_interval_not_consumed")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        }
      </AdminCard>
    </div>
  );
}
