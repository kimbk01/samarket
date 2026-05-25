import { runSingleFlight } from "@/lib/http/run-single-flight";
import { logDeliveryFetchTrace } from "@/lib/dibay/delivery-waterfall-trace";

export type DeliveryRideTimeSource = "google" | "store";

const FLIGHT_KEY = "app:delivery-ride-time-source";
const RIDE_TIME_SOURCE_TTL_MS = 60_000;

let memoryCache: { expiresAt: number; source: DeliveryRideTimeSource } | null = null;

/** 매장 프로필·설정·장바구니 등 — 60s memory + singleflight */
export function fetchDeliveryRideTimeSourceDeduped(): Promise<DeliveryRideTimeSource> {
  if (memoryCache && memoryCache.expiresAt > Date.now()) {
    return Promise.resolve(memoryCache.source);
  }
  return runSingleFlight(FLIGHT_KEY, async () => {
    if (memoryCache && memoryCache.expiresAt > Date.now()) {
      return memoryCache.source;
    }
    try {
      logDeliveryFetchTrace({
        api: "/api/app/delivery-ride-time-source",
        component: "delivery-ride-time-source-client",
        reason: "fetchDeliveryRideTimeSourceDeduped_network",
      });
      const res = await fetch("/api/app/delivery-ride-time-source", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; source?: unknown };
      const source: DeliveryRideTimeSource = j.source === "google" ? "google" : "store";
      memoryCache = { expiresAt: Date.now() + RIDE_TIME_SOURCE_TTL_MS, source };
      return source;
    } catch {
      return "store";
    }
  });
}
