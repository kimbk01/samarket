"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** hydration 일치 — SSR·클라 첫 페인트 동일 */
function TradeMeetSpotRouteLoading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-sam-app sam-text-body text-sam-muted">
      {t("common_loading")}
    </div>
  );
}

const TradeMeetSpotPickClient = dynamic(
  () =>
    import("@/components/write/trade/TradeMeetSpotPickClient").then((m) => ({
      default: m.TradeMeetSpotPickClient,
    })),
  { ssr: false, loading: TradeMeetSpotRouteLoading }
);

export function TradeMeetSpotPickRoute() {
  return (
    <Suspense fallback={<TradeMeetSpotRouteLoading />}>
      <TradeMeetSpotPickClient />
    </Suspense>
  );
}
