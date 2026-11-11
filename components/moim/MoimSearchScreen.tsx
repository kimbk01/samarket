"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { moimRoutes } from "@/lib/moim/moim-client-api";
import { MoimLocalList } from "@/components/moim/MoimLocalList";
import { useMoimLocalList } from "@/components/moim/use-moim-local-list";
import { MoimEmptyState, moimCls } from "@/components/moim/moim-ui";

/** 모임 찾기 /moim/search — 우리 동네 모임에서 이름·소개 검색 */
export function MoimSearchScreen() {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const list = useMoimLocalList({ q: query, enabled: query.length > 0 });

  const header = useMemo(() => ({ titleText: t("moim_search_title"), backHref: moimRoutes.tab }), [t]);
  useRegisterMainTier1Header(header);

  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  return (
    <div className={`${moimCls.page} pb-10`}>
      <div className={moimCls.column}>
        <form
          className="px-4 pb-3 pt-3"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(input.trim());
          }}
        >
          <label className={`${moimCls.input} flex items-center gap-2`}>
            <Search className="h-4 w-4 shrink-0 text-sam-meta" aria-hidden />
            <input
              type="search"
              autoFocus
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("moim_search_placeholder")}
              aria-label={t("moim_search_title")}
            />
          </label>
        </form>
        {query ? <MoimLocalList list={list} emptyKey="moim_search_empty" /> : <MoimEmptyState>{t("moim_search_hint")}</MoimEmptyState>}
      </div>
    </div>
  );
}
