import { runSingleFlight } from "@/lib/http/run-single-flight";

export type DeliveryRideTimeSource = "google" | "store";

const FLIGHT_KEY = "app:delivery-ride-time-source";

/** 매장 프로필·설정 등에서 동일 API 중복 호출 방지 */
export function fetchDeliveryRideTimeSourceDeduped(): Promise<DeliveryRideTimeSource> {
  return runSingleFlight(FLIGHT_KEY, async () => {
    try {
      const res = await fetch("/api/app/delivery-ride-time-source", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; source?: unknown };
      return j.source === "google" ? "google" : "store";
    } catch {
      return "store";
    }
  });
}
