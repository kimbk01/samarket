/**
 * GET /api/order-chat/orders/:orderId — 통합 채팅·주문 채팅 전용 화면이 동시에 열릴 때 한 번으로 합류.
 * (응답 본문은 한 번만 읽고 공유 — Response 객체를 여러 번 넘기지 않음)
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export const orderChatGetFlightKey = (orderId: string) =>
  `order-chat:get:${orderId.trim()}`;

export async function fetchOrderChatGetDeduped(
  orderId: string
): Promise<{ status: number; json: unknown }> {
  const oid = orderId.trim();
  if (!oid) return { status: 400, json: {} };
  const res = await runSingleFlight(orderChatGetFlightKey(oid), () =>
    fetch(`/api/order-chat/orders/${encodeURIComponent(oid)}`, {
      credentials: "include",
      cache: "no-store",
    })
  );
  const json: unknown = await res.clone().json().catch(() => ({}));
  return { status: res.status, json };
}

export function forgetOrderChatGetDeduped(orderId: string): void {
  const oid = orderId.trim();
  if (!oid) return;
  forgetSingleFlight(orderChatGetFlightKey(oid));
}
