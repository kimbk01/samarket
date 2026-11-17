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
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import {
  releaseMessengerChannel,
  whenMessengerTopicFree,
} from "@/lib/community-messenger/realtime/messenger-channel-topic-lease";

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
  let ch: ReturnType<typeof sb.channel> | null = null;
  void (async () => {
    await whenMessengerTopicFree(sb, name);
    if (!alive) return;
    ch = sb.channel(name, messengerPrivateBroadcastChannelOptions());
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
    });
    ch.subscribe(createMessengerPrivateChannelStatusHandler({ sb, scope: "home_list_insert" }));
  })();
  return () => {
    alive = false;
    releaseMessengerChannel(sb, ch);
    ch = null;
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
