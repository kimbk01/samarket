"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { ADDR_SEARCH_DROPDOWN, ADDR_SEARCH_INPUT, ADDR_SEARCH_WRAP } from "@/lib/ui/address-flow-viber";

/** `AddressSearch` 와 동일 검색창 토큰 + 편집기 자동완성 목록 */
export function AddressEditorLocationSearch(props: {
  search: string;
  searching: boolean;
  predictions: PlacePredictionRow[];
  resolvingPlaceId: string | null;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSelectPrediction: (row: PlacePredictionRow) => void;
}) {
  const { t } = useI18n();
  const {
    search,
    searching,
    predictions,
    resolvingPlaceId,
    onSearchChange,
    onSearchFocus,
    onSelectPrediction,
  } = props;

  return (
    <div className="space-y-2">
      <div className={ADDR_SEARCH_WRAP}>
        <svg className="h-5 w-5 shrink-0 text-signature/70" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm9.2 2-4.2-4.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          id="addr-editor-search"
          type="search"
          value={search}
          onFocus={onSearchFocus}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("addr_ui_search_placeholder")}
          autoComplete="off"
          enterKeyHint="search"
          className={ADDR_SEARCH_INPUT}
        />
      </div>
      {searching ? <p className="sam-text-helper text-sam-muted">{t("addr_ui_searching")}</p> : null}
      {predictions.length > 0 ? (
        <ul className={ADDR_SEARCH_DROPDOWN}>
          {predictions.map((p) => (
            <li key={p.placeId} className="border-b border-sam-border/70 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelectPrediction(p)}
                disabled={resolvingPlaceId === p.placeId}
                className="block min-h-[44px] w-full px-3 py-2.5 text-left transition-colors hover:bg-sam-surface active:bg-sam-primary-soft/25 disabled:opacity-60"
              >
                <span className="block sam-text-body font-semibold text-sam-fg">{p.mainText}</span>
                <span className="mt-0.5 block sam-text-helper text-sam-muted">
                  {p.secondaryText || p.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
