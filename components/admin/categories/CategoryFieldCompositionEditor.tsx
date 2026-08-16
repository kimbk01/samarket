"use client";

/**
 * Admin V1 — compose approved Field Library ids onto a trade category.
 * Cannot invent fields / storagePath / validators.
 */
import { useMemo } from "react";
import {
  getTradeSeedComposition,
  resolveTradeCompositionProfileId,
  serializeTradeFieldCompositionPayload,
  type TradeCompositionFieldOverlay,
  type TradeFieldCompositionPayload,
} from "@/lib/trade/category-form";
import { TRADE_FIELD_LIBRARY } from "@/lib/trade/category-form/field-library";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import { parseTradeFieldCompositionPayload } from "@/lib/trade/category-form/parse-field-composition";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  iconKey: string;
  slug: string;
  value: unknown | null;
  onChange: (next: TradeFieldCompositionPayload | null) => void;
};

function seedOverlays(iconKey: string, slug: string): TradeCompositionFieldOverlay[] {
  const profileId = resolveTradeCompositionProfileId({ icon_key: iconKey, slug });
  const seed = profileId ? getTradeSeedComposition(profileId) : null;
  return seed ? seed.fields.map((f) => ({ ...f })) : [];
}

export function CategoryFieldCompositionEditor({ iconKey, slug, value, onChange }: Props) {
  const { language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";

  const rows = useMemo(() => {
    const parsed = parseTradeFieldCompositionPayload(value);
    if (parsed) return [...parsed.fields].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    return seedOverlays(iconKey, slug);
  }, [value, iconKey, slug]);

  const libraryIds = useMemo(() => Object.keys(TRADE_FIELD_LIBRARY).sort(), []);

  const emit = (nextRows: TradeCompositionFieldOverlay[]) => {
    onChange(serializeTradeFieldCompositionPayload({ v: 1, fields: nextRows }));
  };

  const updateRow = (id: string, patch: Partial<TradeCompositionFieldOverlay>) => {
    emit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const move = (id: string, dir: -1 | 1) => {
    const sorted = [...rows].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const idx = sorted.findIndex((r) => r.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[j];
    const orderA = a.order;
    emit(
      sorted.map((r) => {
        if (r.id === a.id) return { ...r, order: b.order };
        if (r.id === b.id) return { ...r, order: orderA };
        return r;
      })
    );
  };

  const addField = (id: string) => {
    if (!id || rows.some((r) => r.id === id)) return;
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.order), 0);
    emit([...rows, { id, active: true, required: false, order: maxOrder + 10 }]);
  };

  const removeField = (id: string) => {
    emit(rows.filter((r) => r.id !== id));
  };

  const unused = libraryIds.filter((id) => !rows.some((r) => r.id === id));

  return (
    <div className="space-y-3 rounded border border-sam-border-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_cat_composition_title")}</p>
        <button type="button" onClick={() => onChange(null)} className="sam-text-helper text-sam-primary underline">
          {t("admin_cat_composition_reset_seed")}
        </button>
      </div>
      <p className="sam-text-xxs text-sam-muted">{t("admin_cat_composition_hint")}</p>
      <ul className="space-y-2">
        {rows
          .slice()
          .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
          .map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded bg-sam-app px-2 py-1.5 sam-text-helper"
            >
              <span className="min-w-[7rem] font-medium text-sam-fg">{tradeFieldAdminLabel(r.id, lang)}</span>
              <label className="flex items-center gap-1 text-sam-muted">
                <input
                  type="checkbox"
                  checked={r.active !== false}
                  onChange={(e) => updateRow(r.id, { active: e.target.checked })}
                  className="rounded"
                />
                {t("admin_cat_composition_active")}
              </label>
              <label className="flex items-center gap-1 text-sam-muted">
                <input
                  type="checkbox"
                  checked={r.required === true}
                  onChange={(e) => updateRow(r.id, { required: e.target.checked })}
                  className="rounded"
                />
                {t("admin_cat_composition_required")}
              </label>
              <span className="text-sam-meta">#{r.order}</span>
              <button type="button" className="text-sam-primary" onClick={() => move(r.id, -1)}>
                ↑
              </button>
              <button type="button" className="text-sam-primary" onClick={() => move(r.id, 1)}>
                ↓
              </button>
              <button type="button" className="text-sam-danger" onClick={() => removeField(r.id)}>
                {t("admin_cat_delete")}
              </button>
            </li>
          ))}
      </ul>
      {unused.length > 0 ? (
        <div>
          <label className="block sam-text-helper text-sam-muted">{t("admin_cat_composition_add")}</label>
          <select
            className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) addField(id);
              e.target.value = "";
            }}
          >
            <option value="">{t("admin_cat_composition_add_ph")}</option>
            {unused.map((id) => (
              <option key={id} value={id}>
                {tradeFieldAdminLabel(id, lang)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
