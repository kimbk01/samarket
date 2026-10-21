"use client";

import { useRef } from "react";
import { Loader2, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import {
  ADDR_SEARCH_DROPDOWN,
  ADDR_SEARCH_INPUT,
  ADDR_SEARCH_INPUT_NO_NATIVE_CANCEL,
  ADDR_SEARCH_WRAP,
} from "@/lib/ui/address-flow-viber";
import { Sam } from "@/lib/ui/sam-component-classes";

/** `AddressSearch` 와 동일 검색창 토큰 + 편집기 자동완성 목록 */
export function AddressEditorLocationSearch(props: {
  search: string;
  searching: boolean;
  predictions: PlacePredictionRow[];
  resolvingPlaceId: string | null;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSelectPrediction: (row: PlacePredictionRow) => void;
  placeholder?: string;
  /** 화면 단일 비행 — 어떤 선택(결과 행·현재 위치)이 진행 중이면 모든 결과 행 비활성 */
  selectionLocked?: boolean;
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
    selectionLocked = false,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const placeholderText = placeholder || t("addr_ui_search_placeholder");
  const rowsLocked = selectionLocked || resolvingPlaceId != null;

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
          ref={inputRef}
          placeholder={placeholderText}
          aria-label={placeholderText}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          className={`${ADDR_SEARCH_INPUT} ${ADDR_SEARCH_INPUT_NO_NATIVE_CANCEL}`}
        />
        {search ? (
          <button
            type="button"
            aria-label={t("addr_ui_search_clear_aria")}
            data-testid="address-search-clear"
            /** 입력 포커스(키보드) 유지 — 버튼이 포커스를 가져가지 않게 */
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            className={`-my-1.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sam-muted transition-colors hover:text-sam-fg active:bg-sam-pressed-surface ${Sam.focusRing}`}
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="sam-text-helper text-sam-muted empty:hidden" aria-live="polite" role="status">
        {searching ? t("addr_ui_searching") : ""}
      </p>
      {predictions.length > 0 ? (
        <ul className={ADDR_SEARCH_DROPDOWN}>
          {predictions.map((p) => (
            <li key={p.placeId} className="border-b border-sam-border/70 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelectPrediction(p)}
                disabled={rowsLocked}
                aria-busy={resolvingPlaceId === p.placeId || undefined}
                className={`flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-sam-surface active:bg-sam-primary-soft/25 disabled:opacity-60 ${Sam.focusRing}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block sam-text-body font-semibold text-sam-fg">{p.mainText}</span>
                  <span className="mt-0.5 block sam-text-helper text-sam-muted">
                    {p.secondaryText || p.description}
                  </span>
                </span>
                {resolvingPlaceId === p.placeId ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sam-primary" aria-hidden />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
