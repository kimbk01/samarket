import { Suspense } from "react";
import { TradeMeetSpotPickClient } from "@/components/write/trade/TradeMeetSpotPickClient";

export default function TradeMeetSpotPickPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-sam-app sam-text-body text-sam-muted">
          불러오는 중…
        </div>
      }
    >
      <TradeMeetSpotPickClient />
    </Suspense>
  );
}
