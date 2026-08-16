"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

function Loading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-sam-app text-sm text-sam-fg-muted">
      …
    </div>
  );
}

const TradeBrowseLocationSearchPage = dynamic(
  () =>
    import("@/components/trade/location/TradeBrowseLocationSearchPage").then((m) => ({
      default: m.TradeBrowseLocationSearchPage,
    })),
  { ssr: false, loading: Loading }
);

export function TradeBrowseLocationSearchRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <TradeBrowseLocationSearchPage />
    </Suspense>
  );
}
