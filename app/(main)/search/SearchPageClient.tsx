"use client";

import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SearchView } from "@/components/search/SearchView";

function SearchFallback() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center py-12">
      <p className="sam-text-body text-sam-muted">{t("common_search")}</p>
    </div>
  );
}

export default function SearchPageClient() {
  return (
    <div className="min-h-screen bg-sam-app">
      <Suspense fallback={<SearchFallback />}>
        <SearchView />
      </Suspense>
    </div>
  );
}
