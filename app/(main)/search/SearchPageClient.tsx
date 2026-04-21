"use client";

import { Suspense } from "react";
import { SearchView } from "@/components/search/SearchView";

function SearchFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="sam-text-body text-sam-muted">검색</p>
    </div>
  );
}

export default function SearchPageClient() {
  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <Suspense fallback={<SearchFallback />}>
        <SearchView />
      </Suspense>
    </div>
  );
}
