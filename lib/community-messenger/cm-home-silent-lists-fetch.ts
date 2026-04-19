"use client";

/**
 * 홈 사일런트 갱신 — `GET /api/community-messenger/home-sync` 한 번으로
 * 방 목록·친구 요청·친구 목록 정합 (이전 3병렬 fetch 대비 RTT·핸들러 비용 감소).
 * 정책 표: `docs/messenger-realtime-policy.md`
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { recordMessengerHomeHomeSyncNetworkFetch } from "@/lib/runtime/samarket-runtime-debug";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

const FLIGHT_KEY = "community-messenger:home:silent:home_sync";

export type CommunityMessengerHomeSilentListsPayload = {
  res: Response;
  json: {
    ok?: boolean;
    chats?: CommunityMessengerRoomSummary[];
    groups?: CommunityMessengerRoomSummary[];
    requests?: CommunityMessengerBootstrap["requests"];
    friends?: CommunityMessengerProfileLite[];
  };
};

export function fetchCommunityMessengerHomeSilentLists(): Promise<CommunityMessengerHomeSilentListsPayload> {
  return runSingleFlight(FLIGHT_KEY, async () => {
    recordMessengerHomeHomeSyncNetworkFetch();
    const res = await fetch("/api/community-messenger/home-sync", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as CommunityMessengerHomeSilentListsPayload["json"];
    return { res, json };
  });
}
