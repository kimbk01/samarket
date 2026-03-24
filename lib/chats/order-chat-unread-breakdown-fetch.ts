/**
 * 주문 채팅 미읽음( breakdown API ) — 동시 호출 합치기.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export function fetchOrderChatUnreadBreakdown(): Promise<{ orderTotal: number }> {
  return runSingleFlight("chat:unread-breakdown", async () => {
    try {
      const res = await fetch("/api/chat/unread-breakdown", { cache: "no-store" });
      if (!res.ok) return { orderTotal: 0 };
      const j = (await res.json()) as { orderTotal?: unknown };
      const o = Math.max(0, Math.floor(Number(j.orderTotal) || 0));
      return { orderTotal: o };
    } catch {
      return { orderTotal: 0 };
    }
  });
}
