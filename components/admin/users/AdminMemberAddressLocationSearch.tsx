"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import type { PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { ADDR_SEARCH_DROPDOWN, ADDR_SEARCH_INPUT, ADDR_SEARCH_WRAP } from "@/lib/ui/address-flow-viber";

/**
 * Admin 수동 회원 등록 주소 검색 — `AddressEditorLocationSearch`(사용자 화면 공용)와 같은 입력·목록 동작,
 * 후보 선택 버튼만 Admin CTA 부품(`AdminActionButton`)으로 그린다.
 */
export function AdminMemberAddressLocationSearch(props: {
  search: string;
  searching: boolean;
  predictions: PlacePredictionRow[];
  resolvingPlaceId: string | null;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSelectPrediction: (row: PlacePredictionRow) => void;
  placeholder?: string;
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
    placeholder,
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
          placeholder={placeholder || t("addr_ui_search_placeholder")}
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
              <AdminActionButton
                variant="quiet"
                onClick={() => onSelectPrediction(p)}
                disabled={resolvingPlaceId === p.placeId}
                className="!flex !h-auto min-h-[44px] w-full !flex-col !items-start !justify-start !whitespace-normal !rounded-none py-2.5 text-left !no-underline hover:bg-sam-surface"
              >
                <span className="block sam-text-body font-semibold text-sam-fg">{p.mainText}</span>
                <span className="mt-0.5 block sam-text-helper font-normal text-sam-muted">
                  {p.secondaryText || p.description}
                </span>
              </AdminActionButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
