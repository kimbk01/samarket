import type {
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import {
  COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP,
  COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP,
} from "@/lib/community-messenger/home-sync-room-caps";
import {
  listCommunityMessengerFriendRequests,
  listCommunityMessengerFriends,
  listCommunityMessengerMyChatsAndGroups,
} from "@/lib/community-messenger/service";
import { homeSyncBreakdownEnabled, logHomeSyncBreakdown } from "@/lib/community-messenger/home-sync-breakdown-log";
import { logMessengerPerfMs, messengerPerfStepsEnabled } from "@/lib/community-messenger/messenger-home-sync-perf-log";
import { homeSyncTraceMeterEnabled, ms, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";

/**
 * 홈 사일런트 갱신 — `GET /api/community-messenger/home-sync` 전용.
 * 구현은 `service.ts` 와 분리해 단일 왕복 경로만 얇게 유지한다(스트랭글러 1단계).
 * `homeSyncSkipHeavyEnrich` 는 Philife 오픈그룹 라벨 보강만 생략; 거래 방 썸네일은 `listCommunityMessengerMyChatsAndGroups` full tier에서 별도 enrich.
 */
export async function getCommunityMessengerHomeSyncBundle(
  userId: string,
  tier: "critical" | "full" = "full",
  options?: { trace?: HomeSyncTrace }
): Promise<{
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
  requests: CommunityMessengerFriendRequest[];
  friends: CommunityMessengerProfileLite[];
}> {
  const tBundle = performance.now();
  if (tier === "critical") {
    const roomsBlock = await listCommunityMessengerMyChatsAndGroups(userId, {
      tier: "critical",
      roomListCap: COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP,
      homeSyncSkipHeavyEnrich: true,
      trace: options?.trace,
    });
    if (homeSyncTraceMeterEnabled(options?.trace)) {
      const bundleTotalMs = performance.now() - tBundle;
      const tr = options!.trace!;
      const tradeMs = tr.deepSteps.tradeMetaEnrich?.totalMs ?? 0;
      tr.deepSteps.bundleSteps = {
        ...(tr.deepSteps.bundleSteps ?? {}),
        bundleTotalMs: ms(bundleTotalMs),
        tradeMetaEnrichTotalMs: ms(tradeMs),
        outsideTradeEnrichMs: ms(Math.max(0, bundleTotalMs - tradeMs)),
      };
    }
    if (messengerPerfStepsEnabled()) {
      logMessengerPerfMs("home_sync_fetch", performance.now() - tBundle);
    }
    if (homeSyncBreakdownEnabled()) {
      logHomeSyncBreakdown("get_home_sync_bundle_critical_wall_ms", performance.now() - tBundle, {
        tier: "critical",
      });
    }
    return {
      chats: roomsBlock.chats,
      groups: roomsBlock.groups,
      requests: [],
      friends: [],
    };
  }
  let friendsFetchMs = 0;
  let friendsRequestsFetchMs = 0;
  const tPar = performance.now();
  const [roomsBlock, requests, friends] = await Promise.all([
    listCommunityMessengerMyChatsAndGroups(userId, {
      tier: "full",
      roomListCap: COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP,
      homeSyncSkipHeavyEnrich: true,
      trace: options?.trace,
    }),
    (async () => {
      const tReq = performance.now();
      const rows = await listCommunityMessengerFriendRequests(userId);
      friendsRequestsFetchMs = performance.now() - tReq;
      return rows;
    })(),
    (async () => {
      const tFr = performance.now();
      const rows = await listCommunityMessengerFriends(userId);
      friendsFetchMs = performance.now() - tFr;
      return rows;
    })(),
  ]);
  const bundleParallelWallMs = performance.now() - tPar;
  if (homeSyncTraceMeterEnabled(options?.trace)) {
    const bundleTotalMs = performance.now() - tBundle;
    const tr = options!.trace!;
    const tradeMs = tr.deepSteps.tradeMetaEnrich?.totalMs ?? 0;
    tr.deepSteps.bundleSteps = {
      ...(tr.deepSteps.bundleSteps ?? {}),
      bundleTotalMs: ms(bundleTotalMs),
      tradeMetaEnrichTotalMs: ms(tradeMs),
      outsideTradeEnrichMs: ms(Math.max(0, bundleTotalMs - tradeMs)),
      bundleParallelWallMs: ms(bundleParallelWallMs),
      friendsFetchMs: ms(friendsFetchMs),
      friendsRequestsFetchMs: ms(friendsRequestsFetchMs),
    };
  }
  if (messengerPerfStepsEnabled()) {
    logMessengerPerfMs("home_sync_fetch", performance.now() - tBundle);
  }
  if (homeSyncBreakdownEnabled()) {
    logHomeSyncBreakdown("get_home_sync_bundle_full_parallel_wall_ms", bundleParallelWallMs, {
      tier: "full",
      paths: "roomsBlock + friendRequests + friends",
    });
    logHomeSyncBreakdown("get_home_sync_bundle_full_total_wall_ms", performance.now() - tBundle, {
      tier: "full",
    });
  }
  return {
    chats: roomsBlock.chats,
    groups: roomsBlock.groups,
    requests,
    friends,
  };
}

export type CommunityMessengerHomeSyncBundlePayload = Awaited<ReturnType<typeof getCommunityMessengerHomeSyncBundle>>;
