import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminOrderChatRoomsResult = {
  status: number;
  json: unknown;
};

/** 관리자 주문 채팅 방 목록 — 동시 요청 합류 */
export function fetchAdminOrderChatRoomsDeduped(limit = 100): Promise<AdminOrderChatRoomsResult> {
  const lim = Math.min(300, Math.max(1, limit));
  const key = `admin:order-chat:rooms:${lim}`;
  return runSingleFlight(key, async (): Promise<AdminOrderChatRoomsResult> => {
    const res = await fetch(`/api/admin/order-chat/rooms?limit=${lim}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
