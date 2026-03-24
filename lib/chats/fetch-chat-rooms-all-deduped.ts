/**
 * GET /api/chat/rooms (세그먼트 없음) — 미읽음 채팅 진입 등 연타 시 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type ChatRoomsAllResult = {
  status: number;
  json: unknown;
};

export function fetchChatRoomsAllDeduped(): Promise<ChatRoomsAllResult> {
  return runSingleFlight("chat:rooms:all", async (): Promise<ChatRoomsAllResult> => {
    const res = await fetch("/api/chat/rooms", { credentials: "include", cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
