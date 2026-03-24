/**
 * GET /api/me/stores — 짧은 시간에 여러 화면이 동시에 부르면 한 번으로 합침.
 * (매장 관리 허브 vs 주문 목록 등)
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type MeStoresListResult = {
  status: number;
  json: unknown;
};

export function fetchMeStoresListDeduped(): Promise<MeStoresListResult> {
  return runSingleFlight("me:stores:list", async (): Promise<MeStoresListResult> => {
    const res = await fetch("/api/me/stores", { credentials: "include", cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
