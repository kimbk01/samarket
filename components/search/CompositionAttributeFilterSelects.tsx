"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getTradeOptionCatalog,
  labelForTradeOption,
  resolveCompositionAttributeFilterFields,
  tradeFieldAdminLabel,
  type CompositionFilterSelection,
  type ResolvedTradeComposition,
} from "@/lib/trade/category-form";
import {
  isMarketplaceSellIntentListFieldId,
  marketplaceSellIntentDefaultValue,
} from "@/lib/trade/marketplace/sell-intent-list-ssot";

const SELECT_CLASS =
  "min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg";

type Props = {
  composition: ResolvedTradeComposition | null;
  selection: CompositionFilterSelection;
  onChange: (next: CompositionFilterSelection) => void;
};

export function CompositionAttributeFilterSelects({ composition, selection, onChange }: Props) {
  const { language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const fields = composition ? resolveCompositionAttributeFilterFields(composition) : [];
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((field) => {
        const catalogId = field.definition.optionCatalogId;
        if (!catalogId) return null;
        const options = getTradeOptionCatalog(catalogId);
        const label = tradeFieldAdminLabel(field.id, lang);
        const sellIntent = isMarketplaceSellIntentListFieldId(field.id);
        const defaultSell = sellIntent ? marketplaceSellIntentDefaultValue(field.id) : null;
        const selected = selection[field.id] ?? (defaultSell ?? "");
        return (
          <select
            key={field.id}
            aria-label={label}
            value={selected}
            onChange={(e) => {
              const value = e.target.value.trim();
              const next: CompositionFilterSelection = { ...selection };
              if (!value) delete next[field.id];
              else next[field.id] = value;
              onChange(next);
            }}
            className={SELECT_CLASS}
          >
            {sellIntent ? null : <option value="">{label}</option>}
            {options.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {labelForTradeOption(catalogId, entry.value, lang)}
              </option>
            ))}
          </select>
        );
      })}
    </>
  );
}
