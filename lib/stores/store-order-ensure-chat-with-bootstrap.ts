import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import { hydrateStoreOrderRoomFullMessageHistory } from "@/lib/store-order-chat/server/hydrate-store-order-room-full-message-history";
import {
  runEnsureStoreOrderChatForRoute,
} from "@/lib/stores/ensure-store-order-chat-route";
import type { StoreOrderDetailPerfLog } from "@/lib/stores/store-order-detail-perf";

export type EnsureStoreOrderChatWithBootstrapResult =
  | {
      ok: true;
      roomId: string;
      order_chat_ready: true;
      roomSnapshot: CommunityMessengerRoomSnapshot;
    }
  | { ok: false; error: string; status: number };

/**
 * POST ensure-chat mutation + room bootstrap(+주문 방 full history) — HTTP 1왕복.
 * 매장·구매자 주문 채팅 진입 공통.
 */
export async function ensureStoreOrderChatWithBootstrap(params: {
  sb: SupabaseClient<any>;
  orderId: string;
  userId: string;
  route: StoreOrderDetailPerfLog["route"];
}): Promise<EnsureStoreOrderChatWithBootstrapResult> {
  const ensured = await runEnsureStoreOrderChatForRoute(params);
  if (!ensured.ok) return ensured;

  const readPort = createSupabaseCommunityMessengerReadPort();
  let snapshot = await loadCommunityMessengerRoomBootstrap(readPort, params.userId, ensured.roomId, {
    initialMessageLimit: COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
    snapshotTier: "critical",
    hydrateFullMemberList: false,
    deferSnapshotSecondary: true,
  });
  if (!snapshot) {
    return { ok: false, error: "bootstrap_failed", status: 500 };
  }

  snapshot = await hydrateStoreOrderRoomFullMessageHistory(params.userId, ensured.roomId, snapshot);

  return {
    ok: true,
    roomId: ensured.roomId,
    order_chat_ready: ensured.order_chat_ready,
    roomSnapshot: snapshot,
  };
}
