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

const TradeBrowseLocationDistancePage = dynamic(
  () =>
    import("@/components/trade/location/TradeBrowseLocationDistancePage").then((m) => ({
      default: m.TradeBrowseLocationDistancePage,
    })),
  { ssr: false, loading: Loading }
);

export function TradeBrowseLocationDistanceRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <TradeBrowseLocationDistancePage />
    </Suspense>
  );
}
