"use client";

import { useEffect, useRef } from "react";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  applyBootstrapCacheBusEvent,
  noteBootstrapCacheBusWriterViewerUserId,
} from "@/lib/community-messenger/home/bootstrap-cache-bus-writer";
import {
  onCommunityMessengerBusEvent,
  type MessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";

const HOST_CACHE_BUS_TYPES = new Set<MessengerBusEvent["type"]>([
  "cm.room.message_sent",
  "cm.room.call_stub_preview",
  "cm.home.merge_room_summary",
  /** participants unread — layout 마운트 중 Home 없이도 목록 배지 캐시 유지 */
  "cm.room.summary_patch",
]);

/**
 * `/community-messenger` layout 에 항상 마운트 — Home 언마운트(통화·모바일 전환) 중에도
 * bootstrap sessionStorage cache 를 bus 이벤트로 단일 갱신한다.
 */
export function CommunityMessengerBootstrapCacheSyncHost() {
  const userIdRef = useRef<string | null>(null);
  const subscriptionCountRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const syncUser = () => {
      void getCurrentUserIdForDb().then((id) => {
        if (!alive) return;
        const next = id?.trim() || null;
        userIdRef.current = next;
        noteBootstrapCacheBusWriterViewerUserId(next);
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console -- mount scope diagnostics
          console.log("[cm-bootstrap-cache-sync-host]", {
            phase: "viewer_sync",
            userId: next,
            subscriptionCount: subscriptionCountRef.current,
          });
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
    subscriptionCountRef.current += 1;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- mount scope diagnostics
      console.log("[cm-bootstrap-cache-sync-host]", {
        phase: "mount",
        subscriptionCount: subscriptionCountRef.current,
      });
    }
    const off = onCommunityMessengerBusEvent((ev: MessengerBusEvent) => {
      if (!HOST_CACHE_BUS_TYPES.has(ev.type)) return;
      const me = userIdRef.current?.trim();
      if (!me) return;
      applyBootstrapCacheBusEvent(ev, me);
    });
    return () => {
      off();
      subscriptionCountRef.current = Math.max(0, subscriptionCountRef.current - 1);
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console -- mount scope diagnostics
        console.log("[cm-bootstrap-cache-sync-host]", {
          phase: "unmount",
          subscriptionCount: subscriptionCountRef.current,
        });
      }
    };
  }, []);

  return null;
}
