import { after } from "next/server";
import { recordMessengerMonitoringEvent } from "@/lib/community-messenger/monitoring/server-store";

function roomIdSuffix(rid: string): string {
  const t = rid.trim();
  return t.length <= 8 ? t : t.slice(-8);
}

export type MessengerRoomPageRscTimerPhase =
  | "server_entry"
  | "bootstrap_start"
  | "bootstrap_end"
  | "pre_return"
  | "response_after";

/**
 * 방 페이지 RSC 서버 구간 계측 — `CommunityMessengerRoomPageLoaded` 전용.
 * 값은 모두 **페이지 함수 진입 시점 기준 누적 ms** (`performance.now()`).
 */
export function createMessengerRoomPageRscTimers(roomIdRaw: string) {
  const t0 = performance.now();
  const suffix = roomIdSuffix(roomIdRaw);

  const mark = (phase: MessengerRoomPageRscTimerPhase) => {
    const elapsed = Math.round(performance.now() - t0);
    if (process.env.MESSENGER_PERF_TRACE_ROOM_RSC === "1") {
      console.info(
        JSON.stringify({
          kind: "messenger_room_rsc_page",
          phase,
          roomIdSuffix: suffix,
          elapsed_since_page_fn_ms: elapsed,
        })
      );
    }
    recordMessengerMonitoringEvent({
      ts: Date.now(),
      category: "api.community_messenger",
      metric: `room_rsc_page_${phase}`,
      source: "server",
      value: elapsed,
      unit: "ms",
      labels: { roomIdSuffix: suffix },
    });
  };

  const scheduleResponseAfter = () => {
    after(() => {
      mark("response_after");
    });
  };

  return { mark, scheduleResponseAfter };
}
