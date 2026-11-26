"use client";

/**
 * Browser-safe subscription for home list INSERT broadcasts (invitee / create peer).
 * Server publish is a separate module — do not import it from this client graph.
 */
import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  CM_HOME_LIST_ROOM_INSERT_EVENT,
  communityMessengerHomeListChannelName,
  isCanonicalHomeListRoomSummaryPayload,
} from "@/lib/community-messenger/realtime/home-list-room-insert-contract";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import {
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import {
  releaseSupervisedMessengerChannel,
  whenMessengerTopicFree,
} from "@/lib/community-messenger/realtime/messenger-channel-topic-lease";
import { superviseMessengerChannel } from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";
import type { SubscribeWithRetryHandle } from "@/lib/community-messenger/realtime/cm-rt-channel-registry";

/**
 * Subscribe to user-scoped home list INSERT broadcasts.
 * Materializes via existing `cm.home.merge_room_summary` → insert_room_summary path.
 * Does NOT fabricate summaries; validates server payload only.
 */
export function subscribeHomeListRoomInsertBroadcast(args: {
  userId: string;
  sb?: SupabaseClient | null;
}): () => void {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return () => {};
  const sb = args.sb ?? getSupabaseClient();
  if (!sb) return () => {};

  const name = communityMessengerHomeListChannelName(userId);
  /** 비공개 토픽 `cm-home-list:<uid>` — 수신 = 본인만(`realtime.messages` SELECT 정책) */
  primeMessengerPrivateRealtimeAuth(sb);
  /** X4: 같은 토픽 이전 채널 제거 완료 뒤 생성 — leaving 객체 재사용으로 조용히 죽는 것 방지 */
  let alive = true;
  let handle: SubscribeWithRetryHandle | null = null;
  void (async () => {
    await whenMessengerTopicFree(sb, name);
    if (!alive) return;
    /**
     * 결함 2(2026-11-27 iPhone 실기): 직접 `subscribe()` 는 가입 실패 때 라이브러리가 10초마다 끝없이 재가입했다.
     * 감독 입구로 바꿔 차단기·대기·오프라인 일시정지를 같이 받는다. 재연결 때 다시 읽기는 지금처럼 없다
     * (R2 note 를 부르면 이 채널 하나가 흔들릴 때마다 재동기화 묶음 요청이 늘어난다 — 독립 검토 7번).
     * 설계 docs/audit/supabase-request-surge-2026-11-18/rt-bundle-gen-skip-and-unsupervised-channels-design-2026-11-27.md §3
     */
    handle = superviseMessengerChannel({
      sb,
      name,
      scope: "home_list_insert",
      channelOptions: messengerPrivateBroadcastChannelOptions(),
      isCancelled: () => !alive,
      build: (ch) =>
        ch.on("broadcast", { event: CM_HOME_LIST_ROOM_INSERT_EVENT }, (msg) => {
          const payload = (msg as { payload?: unknown })?.payload;
          if (!payload || typeof payload !== "object") return;
          const row = payload as { room?: unknown; fromUserId?: unknown };
          if (!isCanonicalHomeListRoomSummaryPayload(row.room)) return;
          postCommunityMessengerBusEvent({
            type: "cm.home.merge_room_summary",
            viewerUserId: userId,
            summary: row.room,
            at: Date.now(),
          });
          requestMessengerHubBadgeResync("home_list_merge_summary");
        }),
    });
  })();
  return () => {
    alive = false;
    releaseSupervisedMessengerChannel(name, handle);
    handle = null;
  };
}

/** Hook-friendly wrapper for layout host. */
export function useHomeListRoomInsertBroadcast(userId: string | null | undefined): void {
  const offRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const uid = String(userId ?? "").trim();
    offRef.current?.();
    offRef.current = null;
    if (!uid) return;
    offRef.current = subscribeHomeListRoomInsertBroadcast({ userId: uid });
    return () => {
      offRef.current?.();
      offRef.current = null;
    };
  }, [userId]);
}
