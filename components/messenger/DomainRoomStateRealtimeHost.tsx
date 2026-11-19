/**
 * Phase R — App-global DomainRoomStateRealtimeHost.
 * Home 마운트와 무관하게 bus → DomainRoomStateStore → List cache + Projection Apply.
 */
"use client";

import { useEffect, useRef } from "react";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  onCommunityMessengerBusEvent,
  type MessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import {
  applyBootstrapCacheBusEvent,
  noteBootstrapCacheBusWriterViewerUserId,
} from "@/lib/community-messenger/home/bootstrap-cache-bus-writer";
import {
  dispatchDomainRoomBump,
  dispatchDomainRoomEvent,
  domainRoomMessageEventFromBusIncoming,
  domainRoomReadEventFromRoom,
  roomSummaryToListState,
  seedDomainRoomStateFromBootstrap,
} from "@/lib/community-messenger/realtime/domain-room-state-store";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import {
  applyDomainListCanaryReadPatchByRoomId,
  applyDomainListCanaryUnreadOnlyPatchByRoomId,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import {
  clearDomainStoreOrderCustomerListCanaryCache,
  peekDomainStoreOrderCustomerListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import {
  clearDomainTradeListCanaryCache,
  peekDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import {
  prefetchDomainStoreOrderCustomerListCanaryForHub,
  prefetchDomainTradeListCanaryForHub,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch";
import { resolveMessengerRoomChatDomain } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import {
  projectRoomActivityToHomeList,
  roomActivityFromMessageRow,
} from "@/lib/community-messenger/home/project-room-activity-to-home-list";

const LEGACY_CACHE_BUS_TYPES = new Set<MessengerBusEvent["type"]>([
  "cm.room.message_sent",
  "cm.room.call_stub_preview",
  "cm.home.merge_room_summary",
]);

function resolveIncomingDomainIdentity(
  me: string,
  roomId: string,
  ev: Extract<MessengerBusEvent, { type: "cm.room.incoming_message" }>
): { chatDomain: "trade" | "store_order" | NonNullable<typeof ev.chatDomain>; domainIdentityKey: string | null } | null {
  const cached = findHomeListRoomRow(peekBootstrapCache(), roomId);
  const fromEvDomain = ev.chatDomain ?? (cached?.chatDomain as typeof ev.chatDomain) ?? null;
  const fromEvKey = (ev.domainIdentityKey ?? cached?.domainIdentityKey ?? null)?.trim() || null;

  const tradeRow = peekDomainTradeListCanaryCache(me)?.rows.find((r) => r.roomId === roomId);
  if (tradeRow) {
    return {
      chatDomain: "trade",
      domainIdentityKey: fromEvKey || tradeRow.domainIdentityKey || null,
    };
  }
  const soRow = peekDomainStoreOrderCustomerListCanaryCache(me)?.rows.find((r) => r.roomId === roomId);
  if (soRow) {
    return {
      chatDomain: "store_order",
      domainIdentityKey: fromEvKey || soRow.domainIdentityKey || null,
    };
  }
  if (fromEvDomain) {
    return { chatDomain: fromEvDomain, domainIdentityKey: fromEvKey };
  }
  return null;
}


/**
 * 2026-11-19 (Owner 승인 C1·C3, `docs/audit/remaining-items-2026-11-19.md` C-2) — 참여자 안 읽음 증가를
 * 화면과 무관하게 거래·주문(고객) 목록 캐시에 넣는다. 다른 채팅방 안에서는 대화 홈 실시간 수신이 꺼져
 * 「거래 채팅」 칸이 예전 숫자로 남던 결함(재현 13:22 PHT).
 * - C1: 캐시에 그 방이 있으면 참여자 안 읽음 수로 덮어쓴다(여러 번 와도 같은 값).
 * - C3: 캐시에 없는 거래 방·고객 주문 방이면 그 캐시를 비우고 1회 다시 받는다. 방 종류를 모르면 아무것도 안 한다.
 */
export function syncCommerceListUnreadFromParticipantFact(input: {
  viewerUserId: string;
  roomId: string;
  unreadCount: number;
  storeOrderRole: "customer" | "owner" | null;
}): "patched" | "refetch_trade" | "refetch_store_order" | "skipped" {
  const me = input.viewerUserId.trim();
  const roomId = input.roomId.trim();
  if (!me || !roomId || !(input.unreadCount > 0)) return "skipped";
  const trade = peekDomainTradeListCanaryCache(me);
  const so = peekDomainStoreOrderCustomerListCanaryCache(me);
  const inTrade = Boolean(trade?.rows.some((r) => r.roomId === roomId));
  const inSo = Boolean(so?.rows.some((r) => r.roomId === roomId));
  if (inTrade || inSo) {
    applyDomainListCanaryUnreadOnlyPatchByRoomId({ viewerUserId: me, roomId, unreadCount: input.unreadCount });
    return "patched";
  }
  if (input.storeOrderRole === "owner") return "skipped";
  if (input.storeOrderRole === "customer") {
    if (!so) return "skipped";
    clearDomainStoreOrderCustomerListCanaryCache(me);
    void prefetchDomainStoreOrderCustomerListCanaryForHub();
    return "refetch_store_order";
  }
  if (resolveMessengerRoomChatDomain(roomId, me) === "trade") {
    if (!trade) return "skipped";
    clearDomainTradeListCanaryCache(me);
    void prefetchDomainTradeListCanaryForHub();
    return "refetch_trade";
  }
  return "skipped";
}

/**
 * MessagingGlobalChrome / messenger layout 공통 — DomainRoomStateStore spine owner.
 */
export function DomainRoomStateRealtimeHost() {
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const syncUser = () => {
      void getCurrentUserIdForDb().then((id) => {
        if (!alive) return;
        const next = id?.trim() || null;
        userIdRef.current = next;
        noteBootstrapCacheBusWriterViewerUserId(next);
        const cache = peekBootstrapCache();
        if (cache && next) {
          seedDomainRoomStateFromBootstrap(cache, next);
        }
      });
    };
    syncUser();
    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      syncUser();
    });
    const onTestAuth = () => syncUser();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
    return () => {
      alive = false;
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
      authSub?.data.subscription.unsubscribe();
      noteBootstrapCacheBusWriterViewerUserId(null);
    };
  }, []);

  useEffect(() => {
    const off = onCommunityMessengerBusEvent((ev: MessengerBusEvent) => {
      const me = userIdRef.current?.trim();
      if (!me) return;

      // Keep legacy sessionStorage writer for sender echo / call stub / merge summary.
      if (LEGACY_CACHE_BUS_TYPES.has(ev.type)) {
        applyBootstrapCacheBusEvent(ev, me);
      }

      if (ev.type === "cm.room.incoming_message") {
        if (String(ev.viewerUserId) !== me) return;
        const identity = resolveIncomingDomainIdentity(me, ev.roomId, ev);
        const chatDomain = identity?.chatDomain ?? null;
        const domainIdentityKey = identity?.domainIdentityKey ?? null;
        const tip = roomActivityFromMessageRow({
          roomId: ev.roomId,
          messageRow: ev.messageRow,
          source: "remote_message_realtime",
          boostUnread: true,
          viewerUserId: me,
          chatDomain: chatDomain ?? undefined,
          domainIdentityKey: domainIdentityKey ?? undefined,
        });
        if (tip) {
          projectRoomActivityToHomeList(tip);
        }
        if (!chatDomain || !domainIdentityKey) {
          return;
        }
        const event = domainRoomMessageEventFromBusIncoming({
          roomId: ev.roomId,
          chatDomain,
          domainIdentityKey,
          messageRow: ev.messageRow,
          boostUnread: true,
        });
        if (event) {
          /** Hub tip already via projection — mirrorListCache would dual-write. Canary also via projection. */
          dispatchDomainRoomEvent(event, { mirrorListCache: false });
        }
        return;
      }

      if (ev.type === "cm.room.message_sent") {
        if (!ev.senderUserId || ev.senderUserId.trim() !== me) return;
        const identity = domainRoomReadEventFromRoom({ roomId: ev.roomId });
        if (!identity || identity.type !== "read") return;
        if (ev.listPreview) {
          const tipEventId = ev.clientMessageId?.trim() || `sent:${ev.roomId}:${ev.at}`;
          /** Tip via LEGACY applyBootstrapCacheBusEvent → projection; spine only here. */
          dispatchDomainRoomEvent(
            {
              type: "message",
              roomId: ev.roomId,
              chatDomain: identity.chatDomain,
              domainIdentityKey: identity.domainIdentityKey,
              messageId: tipEventId,
              previewText: ev.listPreview.lastMessage,
              lastMessageAt: ev.listPreview.lastMessageAt,
              lastMessageType: String(ev.listPreview.lastMessageType ?? "text"),
              boostUnread: false,
            },
            { mirrorListCache: false }
          );
        } else {
          dispatchDomainRoomEvent(identity);
        }
        return;
      }

      if (ev.type === "cm.room.read" || ev.type === "cm.room.local_unread") {
        if (String(ev.viewerUserId) !== me) return;
        if (ev.type === "cm.room.local_unread" && ev.unreadCount > 0) {
          applyDomainListCanaryUnreadOnlyPatchByRoomId({
            viewerUserId: me,
            roomId: ev.roomId,
            unreadCount: ev.unreadCount,
          });
          return;
        }
        const readEv = domainRoomReadEventFromRoom({ roomId: ev.roomId });
        if (readEv) dispatchDomainRoomEvent(readEv);
        applyDomainListCanaryReadPatchByRoomId({ viewerUserId: me, roomId: ev.roomId });
        return;
      }

      if (ev.type === "cm.room.summary_patch") {
        if (String(ev.viewerUserId) !== me) return;
        const unread =
          typeof ev.unreadCount === "number" && Number.isFinite(ev.unreadCount)
            ? Math.max(0, Math.floor(ev.unreadCount))
            : null;
        if (unread === 0) {
          const readEv = domainRoomReadEventFromRoom({ roomId: ev.roomId });
          if (readEv) dispatchDomainRoomEvent(readEv);
          applyDomainListCanaryReadPatchByRoomId({ viewerUserId: me, roomId: ev.roomId });
        } else if (unread != null && unread > 0) {
          syncCommerceListUnreadFromParticipantFact({
            viewerUserId: me,
            roomId: ev.roomId,
            unreadCount: unread,
            storeOrderRole: ev.storeOrderRole ?? null,
          });
        }
        return;
      }

      if (ev.type === "cm.home.merge_room_summary") {
        if (String(ev.viewerUserId) !== me) return;
        const mapped = roomSummaryToListState(ev.summary);
        if (mapped) {
          dispatchDomainRoomEvent({ type: "snapshot", mode: "merge", rooms: [mapped] });
        }
        return;
      }

      if (ev.type === "cm.room.bump") {
        dispatchDomainRoomBump(ev.roomId, ev.at);
        return;
      }
    });
    return () => off();
  }, []);

  return null;
}
