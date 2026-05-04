"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import { useIncomingFriendRequestPopup } from "@/lib/community-messenger/use-incoming-friend-request-popup";
import { MessengerIncomingFriendRequestPopup } from "@/components/community-messenger/MessengerIncomingFriendRequestPopup";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";

function rtStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * `(main)` 전역 — 수신 친구 요청 하단 팝업.
 * `useSupabaseNotificationsRealtime` 이 친구요청 알림 행을 스토어에 넣고, 이 훅은 CFR INSERT 만 보강한다.
 */
export function GlobalIncomingFriendRequestHost({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const incomingList = useIncomingFriendRequestPopupStore((s) => s.incomingList);
  const upsertIncoming = useIncomingFriendRequestPopupStore((s) => s.upsertIncoming);
  const dismissAllIncoming = useIncomingFriendRequestPopupStore((s) => s.dismissAllIncoming);
  const dismissIncomingIfRequestId = useIncomingFriendRequestPopupStore((s) => s.dismissIncomingIfRequestId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let cancelled = false;
    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      const uid = session?.user?.id?.trim();
      if (uid) setUserId(uid);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        setUserId(null);
        dismissAllIncoming();
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        const uid = session?.user?.id ?? null;
        setUserId(uid && uid.trim() ? uid.trim() : null);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [enabled, dismissAllIncoming]);

  const onIncoming = useCallback(
    (req: CommunityMessengerFriendRequest) => {
      upsertIncoming(req);
    },
    [upsertIncoming]
  );

  useIncomingFriendRequestPopup(userId, Boolean(enabled && userId), onIncoming);

  useEffect(() => {
    if (!enabled || !userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel(`messenger:incoming-fr-row:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_friend_requests",
          filter: `addressee_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload as { new?: Record<string, unknown> }).new ?? {};
          const id = rtStr(row.id);
          const status = rtStr(row.status);
          const open = useIncomingFriendRequestPopupStore.getState().incomingList;
          if (!id || !open.some((r) => r.id === id)) return;
          if (status && status !== "pending") dismissIncomingIfRequestId(id);
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, userId, dismissIncomingIfRequestId]);

  const respondIncoming = useCallback(
    async (requestId: string, action: "accept" | "reject") => {
      setBusyId(`request:${requestId}:${action}`);
      dismissIncomingIfRequestId(requestId);
      try {
        const res = await fetch(`/api/community-messenger/friend-requests/${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; directRoomId?: string };
        if (
          res.ok &&
          json.ok &&
          action === "accept" &&
          typeof json.directRoomId === "string" &&
          json.directRoomId.trim()
        ) {
          router.push(`/community-messenger/rooms/${encodeURIComponent(json.directRoomId.trim())}`);
        }
      } finally {
        setBusyId(null);
      }
    },
    [dismissIncomingIfRequestId, router]
  );

  if (!mounted || typeof document === "undefined") return null;
  if (!incomingList.length) return null;

  return createPortal(
    <div
      className={`pointer-events-none fixed inset-x-0 z-[118] flex max-h-[min(46vh,380px)] flex-col-reverse gap-2 overflow-y-auto px-3 pb-1 pt-1 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
      data-global-incoming-friend-request
    >
      {incomingList.map((req) => (
        <MessengerIncomingFriendRequestPopup
          key={req.id}
          layout="stack"
          request={req}
          busyId={busyId}
          onDismiss={() => dismissIncomingIfRequestId(req.id)}
          onRespond={(id, action) => void respondIncoming(id, action)}
        />
      ))}
    </div>,
    document.body
  );
}
