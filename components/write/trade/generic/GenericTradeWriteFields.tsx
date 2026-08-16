"use client";

/**
 * Generic Write Renderer — Field Library widgets from Category Composition.
 * Shell fields (images/title/description/location/meet) stay in Common Shell.
 */
import { formatPriceInput } from "@/lib/utils/format";
import {
  TRADE_WRITE_FB_CONTROL,
  TRADE_WRITE_FB_CONTROL_ROW,
  TRADE_WRITE_FB_FIELD_LABEL,
} from "@/lib/ui/trade-write-fb-ui";
import type { AdaptedCompositionField } from "@/lib/trade/category-form/behavior-adapters";
import { getTradeOptionCatalog } from "@/lib/trade/category-form/option-catalogs";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import type { TradeFieldValueBag } from "@/lib/trade/category-form/field-value-bridge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const SHELL_SKIP = new Set([
  "images",
  "title",
  "description",
  "location",
  "trade_meet_spot",
  "is_price_offer",
  "is_free_share",
  /** Complex catalogs still owned by specialized widgets */
  "make",
  "model",
  "car_trade",
  "body_type",
]);

type Props = {
  fields: AdaptedCompositionField[];
  values: TradeFieldValueBag;
  onChange: (fieldId: string, value: string | boolean) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  currencyUnit?: string;
  /** Skip additional field ids (e.g. price when rendered in shell) */
  skipFieldIds?: readonly string[];
};

export function GenericTradeWriteFields({
  fields,
  values,
  onChange,
  errors = {},
  disabled,
  currencyUnit = "",
  skipFieldIds = [],
}: Props) {
  const { language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const skip = new Set([...SHELL_SKIP, ...skipFieldIds]);

  const visible = fields.filter((f) => f.visible && !skip.has(f.id) && f.definition.widget !== "derived");

  if (visible.length === 0) return null;

  return (
    <div className={`space-y-2 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      {visible.map((f) => {
        const def = f.definition;
        const label = tradeFieldAdminLabel(f.id, lang);
        const err = errors[f.id];
        const req = f.effectiveRequired;
        const raw = values[f.id];

        if (def.widget === "boolean") {
          const checked = raw === true || raw === "true";
          return (
            <label key={f.id} className="flex min-h-[44px] cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(f.id, e.target.checked)}
                className="h-4 w-4 rounded border-sam-border text-sam-primary focus:ring-sam-primary/30"
              />
              <span className="sam-text-body-secondary text-sam-fg">
                {label}
                {req ? <span className="text-sam-danger"> *</span> : null}
              </span>
            </label>
          );
        }

        if (def.widget === "select") {
          const opts = getTradeOptionCatalog(def.optionCatalogId);
          const value = typeof raw === "string" ? raw : "";
          return (
            <div key={f.id} className="min-w-0">
              <label className={TRADE_WRITE_FB_FIELD_LABEL}>
                {label}
                {req ? <span className="text-sam-danger"> *</span> : null}
              </label>
              <select
                value={value}
                onChange={(e) => onChange(f.id, e.target.value)}
                className={TRADE_WRITE_FB_CONTROL}
                aria-invalid={!!err}
              >
                <option value="">{t("trade_075")}</option>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {lang === "en" ? o.labelEn : o.labelKo}
                  </option>
                ))}
              </select>
              {err ? <p className="mt-1 sam-text-helper text-sam-danger">{err}</p> : null}
            </div>
          );
        }

        if (def.widget === "money") {
          const value = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
          return (
            <div key={f.id} className="min-w-0">
              <label className={TRADE_WRITE_FB_FIELD_LABEL}>
                {label}
                {req ? <span className="text-sam-danger"> *</span> : null}
              </label>
              <div className={TRADE_WRITE_FB_CONTROL_ROW}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => onChange(f.id, formatPriceInput(e.target.value))}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 sam-text-body outline-none"
                  aria-invalid={!!err}
                />
                {currencyUnit ? (
                  <span className="shrink-0 sam-text-xxs text-sam-muted">{currencyUnit}</span>
                ) : null}
              </div>
              {err ? <p className="mt-1 sam-text-helper text-sam-danger">{err}</p> : null}
            </div>
          );
        }

        if (def.widget === "number" || def.widget === "year") {
          const value = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
          return (
            <div key={f.id} className="min-w-0">
              <label className={TRADE_WRITE_FB_FIELD_LABEL}>
                {label}
                {req ? <span className="text-sam-danger"> *</span> : null}
              </label>
              <input
                type="text"
                inputMode={def.widget === "year" ? "numeric" : "decimal"}
                value={value}
                onChange={(e) => {
                  const v =
                    def.widget === "year"
                      ? e.target.value.replace(/\D/g, "").slice(0, 4)
                      : e.target.value;
                  onChange(f.id, v);
                }}
                className={TRADE_WRITE_FB_CONTROL}
                aria-invalid={!!err}
              />
              {err ? <p className="mt-1 sam-text-helper text-sam-danger">{err}</p> : null}
            </div>
          );
        }

        if (def.widget === "textarea") {
          const value = typeof raw === "string" ? raw : "";
          return (
            <div key={f.id} className="min-w-0">
              <label className={TRADE_WRITE_FB_FIELD_LABEL}>
                {label}
                {req ? <span className="text-sam-danger"> *</span> : null}
              </label>
              <textarea
                value={value}
                onChange={(e) => onChange(f.id, e.target.value)}
                rows={4}
                className={TRADE_WRITE_FB_CONTROL}
                aria-invalid={!!err}
              />
              {err ? <p className="mt-1 sam-text-helper text-sam-danger">{err}</p> : null}
            </div>
          );
        }

        const value = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
        return (
          <div key={f.id} className="min-w-0">
            <label className={TRADE_WRITE_FB_FIELD_LABEL}>
              {label}
              {req ? <span className="text-sam-danger"> *</span> : null}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(f.id, e.target.value)}
              className={TRADE_WRITE_FB_CONTROL}
              aria-invalid={!!err}
            />
            {err ? <p className="mt-1 sam-text-helper text-sam-danger">{err}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Validate adapted required fields against value map */
export function validateAdaptedCompositionValues(
  fields: AdaptedCompositionField[],
  values: TradeFieldValueBag,
  missingLabel: (fieldId: string) => string
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.visible || !f.effectiveRequired) continue;
    if (SHELL_SKIP.has(f.id)) continue;
    if (f.definition.widget === "derived") continue;
    const raw = values[f.id];
    if (f.definition.widget === "boolean") continue;
    const empty =
      raw == null ||
      raw === "" ||
      (typeof raw === "string" && !raw.trim()) ||
      (typeof raw === "number" && Number.isNaN(raw));
    if (empty) errors[f.id] = missingLabel(f.id);
  }
  return errors;
}
