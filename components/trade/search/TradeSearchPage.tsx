"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SectorHeaderBackButton, SectorHeaderBar, SectorHeaderShell } from "@/components/layout/sector-header";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import { buildTradeSearchResultHref } from "@/lib/trade/search/trade-search-paths";
import {
  addTradeRecentSearch,
  clearTradeRecentSearches,
  getTradeRecentSearches,
  removeTradeRecentSearch,
} from "@/lib/trade/search/trade-recent-searches";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

/**
 * 거래 전용 찾기 (재설계 4-1). 거래 글만 찾는다 — 찾기를 누르면 지금 목록 조건을 그대로 둔 채
 * `/market?q=` 결과(일치 → 같은 주제 → 일치하지 않는 글, 목록 계약 순서)로 간다.
 */
export function TradeSearchPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const entrySearch = searchParams.toString();
  const initialQ = sanitizeMarketplaceQueryText(searchParams.get("q")) ?? "";
  const [value, setValue] = useState(initialQ);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    setRecents(getTradeRecentSearches());
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const keyword = sanitizeMarketplaceQueryText(raw) ?? "";
      if (!keyword || submittedRef.current) return;
      submittedRef.current = true;
      addTradeRecentSearch(keyword);
      inputRef.current?.blur();
      router.replace(buildTradeSearchResultHref(entrySearch, keyword));
    },
    [entrySearch, router]
  );

  /** 상태값이 아니라 입력창 실제 글자 — 한글 조합 중 엔터·찾기여도 보이는 글자로 찾는다 */
  const submitFromInput = useCallback(() => {
    window.setTimeout(() => submit(inputRef.current?.value ?? value), 0);
  }, [submit, value]);

  const onFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitFromInput();
  };

  return (
    <div className="min-h-[100dvh] bg-sam-app" data-trade-search-page="true">
      <form onSubmit={onFormSubmit} role="search">
        <SectorHeaderShell>
          <SectorHeaderBar
            centerAlign="left"
            left={
              <SectorHeaderBackButton
                onBack={() => runHistoryBackWithFallback(router, buildTradeSearchResultHref(entrySearch, initialQ))}
              />
            }
            center={
              <div className="sector-header-search-field relative">
                <input
                  ref={inputRef}
                  type="search"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    submitFromInput();
                  }}
                  placeholder={t("trade_search_placeholder")}
                  aria-label={t("trade_search_placeholder")}
                  className="sector-header-search-input pr-9 [&::-webkit-search-cancel-button]:hidden"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={100}
                  data-trade-search-input="true"
                />
                {value ? (
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-sam-muted"
                    aria-label={t("global_search_clear_query")}
                    onClick={() => {
                      setValue("");
                      inputRef.current?.focus();
                    }}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            }
            right={
              <button
                type="submit"
                data-trade-search-submit="true"
                className="shrink-0 rounded-ui-rect bg-sam-primary px-3 py-1.5 text-[14px] font-semibold text-sam-on-primary active:bg-sam-primary-active"
              >
                {t("trade_search_submit")}
              </button>
            }
          />
        </SectorHeaderShell>
      </form>

      <section className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-3`}>
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-sam-fg">{t("trade_search_recent_title")}</h2>
          {recents.length > 0 ? (
            <button
              type="button"
              className="text-[13px] text-sam-muted active:opacity-70"
              onClick={() => setRecents(clearTradeRecentSearches())}
            >
              {t("trade_search_recent_clear")}
            </button>
          ) : null}
        </div>
        {recents.length === 0 ? (
          <p className="mt-3 text-[13px] text-sam-muted">{t("trade_search_recent_empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-sam-border-soft" data-trade-search-recent="true">
            {recents.map((k) => (
              <li key={k} className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate py-3 text-left text-[15px] text-sam-fg active:opacity-70"
                  onClick={() => {
                    setValue(k);
                    submit(k);
                  }}
                >
                  {k}
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-sam-muted"
                  aria-label={t("trade_search_recent_remove_aria", { q: k })}
                  onClick={() => setRecents(removeTradeRecentSearch(k))}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
