/**
 * 내 알림 목록 — 실시간 이벤트 + 폴링 + 가시성 복귀가 겹칠 때 동일 요청 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

const URL = "/api/me/notifications?exclude_owner_store_commerce=1" as const;

export type MeNotificationsListResult = {
  status: number;
  json: unknown;
};

export function fetchMeNotificationsListDeduped(): Promise<MeNotificationsListResult> {
  return runSingleFlight("me:notifications:list:exclude_owner_commerce", async (): Promise<MeNotificationsListResult> => {
    const res = await fetch(URL, { credentials: "include", cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
