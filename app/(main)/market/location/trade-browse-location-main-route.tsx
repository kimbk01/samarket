"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

function TradeBrowseLocationRouteLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-sam-app text-sm text-sam-fg-muted">
      …
    </div>
  );
}

const TradeBrowseLocationMainPage = dynamic(
  () =>
    import("@/components/trade/location/TradeBrowseLocationMainPage").then((m) => ({
      default: m.TradeBrowseLocationMainPage,
    })),
  { ssr: false, loading: TradeBrowseLocationRouteLoading }
);

export function TradeBrowseLocationMainRoute() {
  return (
    <Suspense fallback={<TradeBrowseLocationRouteLoading />}>
      <TradeBrowseLocationMainPage />
    </Suspense>
  );
}
