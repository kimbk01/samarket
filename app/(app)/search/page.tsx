"use client";

import { Suspense } from "react";
import { SearchView } from "@/components/search/SearchView";

function SearchFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-[14px] text-gray-500">검색</p>
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <Suspense fallback={<SearchFallback />}>
        <SearchView />
      </Suspense>
    </div>
  );
}
