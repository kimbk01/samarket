import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, runWithSharedFlightDeadline } from "@/lib/http/shared-flight-deadline";

export type AdminListEntryResult = { status: number; json: unknown };

/**
 * 관리자 배달 알림함 — 초기·무음 갱신 겹침을 한 요청으로 합친다.
 * 파싱 결과만 공유해 두 번째 호출이 같은 Response 본문을 다시 읽지 않게 하고, 멈춘 요청이 키를 붙잡지 않게 한다.
 */
export function fetchAdminDeliveryInboxShared(): Promise<AdminListEntryResult> {
  return runSingleFlight("me:notifications:list:admin-delivery-inbox", () =>
    runWithSharedFlightDeadline("admin_delivery_inbox", ENTRY_SHARED_FLIGHT_DEADLINE_MS, async (signal) => {
      const res = await fetch("/api/me/notifications", { credentials: "include", cache: "no-store", signal });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    })
  );
}

/** 관리자 매장 심사 목록 — 실시간 갱신 single-flight 가 멈춘 요청에 묶이지 않도록 헤더·본문을 한 마감으로 묶는다. */
export function fetchAdminStoresReviewList(apiQs: string): Promise<AdminListEntryResult> {
  return runWithSharedFlightDeadline("admin_stores_review_list", ENTRY_SHARED_FLIGHT_DEADLINE_MS, async (signal) => {
    const res = await fetch(`/api/admin/stores${apiQs}`, { credentials: "include", signal });
    return { status: res.status, json: await res.json().catch(() => null) };
  });
}
