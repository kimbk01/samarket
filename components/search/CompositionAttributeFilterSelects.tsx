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
import { isMarketplaceSellIntentListFieldId } from "@/lib/trade/marketplace/sell-intent-list-ssot";
import { USED_CAR_BRANDS } from "@/lib/trade/used-car-form-catalog";
import { WriteSelectSheetField } from "@/components/write/shared/WriteSelectSheetField";

/** 거래 F FT-2: 중고차 모델은 고른 제조사의 모델만 */
function usedCarModelKeysForMake(makeKey: string | undefined): Set<string> | null {
  const key = (makeKey ?? "").trim();
  if (!key) return null;
  const brand = USED_CAR_BRANDS.find((b) => b.key === key);
  return brand ? new Set(brand.models.map((m) => m.key)) : null;
}

const SELECT_CLASS =
  "min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg";

type Props = {
  composition: ResolvedTradeComposition | null;
  selection: CompositionFilterSelection;
  onChange: (next: CompositionFilterSelection) => void;
};

export function CompositionAttributeFilterSelects({ composition, selection, onChange }: Props) {
  const { language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const fields = composition ? resolveCompositionAttributeFilterFields(composition) : [];
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((field) => {
        const catalogId = field.definition.optionCatalogId;
        if (!catalogId) return null;
        const allowedModels =
          catalogId === "used_car_models" ? usedCarModelKeysForMake(selection.make) : null;
        const options = allowedModels
          ? getTradeOptionCatalog(catalogId).filter((entry) => allowedModels.has(entry.value))
          : getTradeOptionCatalog(catalogId);
        const label = tradeFieldAdminLabel(field.id, lang);
        /**
         * 거래 F FT-1·L-6 (Owner 2026-10-28): 판매 의도(중고차 팝니다/삽니다·구인/구직·환전 팝니다/삽니다)는
         * 자동으로 고르지 않는다 — 기본은 「전체」(조건 없음). 서버 기본값도 같이 없앴다.
         */
        const sellIntent = isMarketplaceSellIntentListFieldId(field.id);
        const selected = selection[field.id] ?? "";
        const placeholder = sellIntent ? `${label} · ${t("common_all")}` : label;
        /** 브라우저 기본 select 는 기기마다 창이 달랐다(삼성 라디오 창·샤오미 드롭다운) — 글쓰기와 같은 앱 바텀시트 */
        return (
          <WriteSelectSheetField
            key={field.id}
            ariaLabel={label}
            value={selected}
            onChange={(raw) => {
              const value = raw.trim();
              const next: CompositionFilterSelection = { ...selection };
              if (!value) delete next[field.id];
              else next[field.id] = value;
              /** FT-2: 제조사를 바꾸면 그 제조사에 없는 모델 선택은 해제 */
              if (field.id === "make") {
                const allowed = usedCarModelKeysForMake(next.make);
                if (next.model && (!allowed || !allowed.has(next.model))) delete next.model;
              }
              onChange(next);
            }}
            options={options.map((entry) => ({
              value: entry.value,
              label: labelForTradeOption(catalogId, entry.value, lang),
            }))}
            placeholder={placeholder}
            sheetTitle={label}
            clearable
            className={SELECT_CLASS}
          />
        );
      })}
    </>
  );
}
