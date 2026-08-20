"use client";

/**
 * Admin V1 — compose approved Field Library ids onto a trade ROOT category.
 * T2: operator-friendly chrome (no profileId / W·L·D·E / raw ids).
 * Cannot invent fields / storagePath / validators.
 */
import { useMemo, useState } from "react";
import {
  getTradeSeedComposition,
  resolveTradeCompositionProfileId,
  serializeTradeFieldCompositionPayload,
  type TradeCompositionFieldOverlay,
  type TradeFieldCompositionPayload,
} from "@/lib/trade/category-form";
import { TRADE_FIELD_LIBRARY } from "@/lib/trade/category-form/field-library";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import { tradeFieldWidgetOperatorLabel } from "@/lib/trade/category-form/field-widget-operator-label";
import { parseTradeFieldCompositionPayload } from "@/lib/trade/category-form/parse-field-composition";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

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
  const { language, t, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [addOpen, setAddOpen] = useState(false);

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
    setAddOpen(false);
  };

  const removeField = (id: string) => {
    emit(rows.filter((r) => r.id !== id));
  };

  const unused = libraryIds.filter((id) => !rows.some((r) => r.id === id));
  const sorted = rows.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_menu_trade_options_heading", {
            fallbackKo: "등록 옵션",
            fallbackEn: "Listing options",
          })}
        </p>
        <button type="button" onClick={() => onChange(null)} className={`${Sam.btn.ghost} ${Sam.btn.sm}`}>
          {t("admin_cat_composition_reset_seed")}
        </button>
      </div>
      <p className="sam-text-body-secondary text-sam-muted">
        {safeT("admin_menu_trade_options_hint", {
          fallbackKo: "필드 라이브러리에서 고른 옵션만 등록·필수·순서를 조정합니다. 선택값(제조사 목록 등)은 별도 관리입니다.",
          fallbackEn: "Add options from the field library and set required/order. Select enums are managed separately.",
        })}
      </p>

      <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
        {sorted.length === 0 ? (
          <li className="px-3 py-6 text-center sam-text-body text-sam-muted">
            {safeT("admin_menu_trade_options_empty", {
              fallbackKo: "등록된 옵션이 없습니다.",
              fallbackEn: "No options yet.",
            })}
          </li>
        ) : (
          sorted.map((r, index) => {
            const def = TRADE_FIELD_LIBRARY[r.id];
            const widgetLabel = tradeFieldWidgetOperatorLabel(def?.widget, lang);
            const requiredLabel = r.required
              ? safeT("admin_cat_composition_required", { fallbackKo: "필수", fallbackEn: "Required" })
              : safeT("admin_menu_trade_option_optional", {
                  fallbackKo: "선택",
                  fallbackEn: "Optional",
                });
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="sam-text-body font-medium text-sam-fg">{tradeFieldAdminLabel(r.id, lang)}</p>
                  <p className="sam-text-xxs text-sam-muted">
                    {widgetLabel} · {requiredLabel} ·{" "}
                    {safeT("admin_menu_trade_option_order", {
                      fallbackKo: "순서 {n}",
                      fallbackEn: "Order {n}",
                      vars: { n: index + 1 },
                    })}
                    {r.active === false
                      ? ` · ${safeT("admin_menu_status_inactive", { fallbackKo: "비활성", fallbackEn: "Inactive" })}`
                      : ""}
                  </p>
                </div>
                <label className="flex items-center gap-1 sam-text-xxs text-sam-muted">
                  <input
                    type="checkbox"
                    checked={r.active !== false}
                    onChange={(e) => updateRow(r.id, { active: e.target.checked })}
                    className="rounded"
                  />
                  {t("admin_cat_composition_active")}
                </label>
                <label className="flex items-center gap-1 sam-text-xxs text-sam-muted">
                  <input
                    type="checkbox"
                    checked={r.required === true}
                    onChange={(e) => updateRow(r.id, { required: e.target.checked })}
                    className="rounded"
                  />
                  {t("admin_cat_composition_required")}
                </label>
                <button type="button" className="sam-text-body-secondary text-signature" onClick={() => move(r.id, -1)}>
                  ↑
                </button>
                <button type="button" className="sam-text-body-secondary text-signature" onClick={() => move(r.id, 1)}>
                  ↓
                </button>
                <button type="button" className="sam-text-body-secondary text-red-600" onClick={() => removeField(r.id)}>
                  {safeT("admin_menu_trade_option_remove", {
                    fallbackKo: "제거",
                    fallbackEn: "Remove",
                  })}
                </button>
              </li>
            );
          })
        )}
      </ul>

      {unused.length > 0 ? (
        <div className="space-y-2">
          {!addOpen ? (
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
              onClick={() => setAddOpen(true)}
            >
              {safeT("admin_menu_trade_option_add", {
                fallbackKo: "+ 옵션 추가",
                fallbackEn: "+ Add option",
              })}
            </button>
          ) : (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
                {safeT("admin_menu_trade_option_pick", {
                  fallbackKo: "옵션 선택",
                  fallbackEn: "Choose option",
                })}
              </p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {unused.map((id) => {
                  const def = TRADE_FIELD_LIBRARY[id];
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-ui-rect px-2 py-2 text-left hover:bg-sam-surface-muted"
                        onClick={() => addField(id)}
                      >
                        <span className="sam-text-body text-sam-fg">{tradeFieldAdminLabel(id, lang)}</span>
                        <span className="sam-text-xxs text-sam-muted">
                          {tradeFieldWidgetOperatorLabel(def?.widget, lang)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className={`mt-2 ${Sam.btn.ghost} ${Sam.btn.sm}`}
                onClick={() => setAddOpen(false)}
              >
                {t("common_cancel")}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
