"use client";

import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { cmRtLogCanonicalRedirect } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import { logNetworkLoopGuard, logNetworkLoopGuardBlocked } from "@/lib/dev/network-loop-guard";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function routeRoomIdEqualsCanonical(route: string, canon: string): boolean {
  const r = route.trim();
  const c = canon.trim();
  if (!r || !c) return false;
  if (r === c) return true;
  const uuidish = /^[0-9a-f-]{36}$/i;
  if (uuidish.test(r) && uuidish.test(c)) {
    return r.replace(/-/g, "").toLowerCase() === c.replace(/-/g, "").toLowerCase();
  }
  return false;
}

/**
 * URL 이 원장 방 id 와 다르면(거래 채팅 id 등) Realtime·히스토리 일관을 위해 정규 UUID 로 교체.
 * `useMessengerRoomClientPhase1` 의 bump 구독 이후 `router.replace` effect 본문·deps 그대로.
 */
export function useMessengerRoomCanonicalRouteReplaceEffect({
  roomId,
  router,
  searchParams,
  snapshot,
}: {
  roomId: string;
  router: { replace: (href: string) => void };
  searchParams: ReadonlyURLSearchParams;
  snapshot: CommunityMessengerRoomSnapshot | null;
}): void {
  const search = searchParams.toString();
  const lastReplaceTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!snapshot?.room?.id) return;
    const canon = String(snapshot.room.id).trim();
    const route = String(roomId ?? "").trim();
    if (!canon || !route || routeRoomIdEqualsCanonical(route, canon)) return;
    const qs = search.length > 0 ? `?${search}` : "";
    const target = `/community-messenger/rooms/${encodeURIComponent(canon)}${qs}`;
    if (typeof window !== "undefined") {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === target) return;
    }
    if (lastReplaceTargetRef.current === target) {
      logNetworkLoopGuardBlocked({
        endpoint: target,
        caller: "useMessengerRoomCanonicalRouteReplaceEffect",
        reason: "duplicate_canonical_replace",
        dedupe_hit: true,
      });
      return;
    }
    lastReplaceTargetRef.current = target;
    cmRtLogCanonicalRedirect({
      fromRouteRoomId: route,
      toCanonicalRoomId: canon,
      viewerUserId: snapshot.viewerUserId,
    });
    logNetworkLoopGuard({
      endpoint: target,
      caller: "useMessengerRoomCanonicalRouteReplaceEffect",
      reason: "canonical_route_replace",
    });
    void router.replace(target);
  }, [roomId, router, search, snapshot]);
}
