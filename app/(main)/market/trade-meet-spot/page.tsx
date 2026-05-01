import dynamic from "next/dynamic";
import { Suspense } from "react";

/** hydration 일치 — SSR·클라 첫 페인트 동일 */
function TradeMeetSpotRouteLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-sam-app sam-text-body text-sam-muted">
      불러오는 중…
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

export default function TradeMeetSpotPickPage() {
  return (
    <Suspense fallback={<TradeMeetSpotRouteLoading />}>
      <TradeMeetSpotPickClient />
    </Suspense>
  );
}
