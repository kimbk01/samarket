import { runSingleFlight } from "@/lib/http/run-single-flight";

export type MeOrderChatRoomsResult = {
  status: number;
  json: unknown;
};

/** 동일 사용자·동일 store 범위에서 목록 요청 합류 */
export function fetchMeOrderChatRoomsDeduped(storeId?: string | null): Promise<MeOrderChatRoomsResult> {
  const key = `me:order-chat:rooms:${storeId?.trim() || "buyer"}`;
  const qs = storeId?.trim() ? `?store_id=${encodeURIComponent(storeId.trim())}` : "";
  return runSingleFlight(key, () =>
    fetch(`/api/me/order-chat/rooms${qs}`, {
      credentials: "include",
      cache: "no-store",
    })
  ).then(async (res): Promise<MeOrderChatRoomsResult> => {
    const json: unknown = await res.clone().json().catch(() => ({}));
    return { status: res.status, json };
  });
}
