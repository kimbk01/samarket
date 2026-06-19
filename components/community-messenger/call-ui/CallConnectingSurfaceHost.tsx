"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CallConnectingSurface } from "@/components/community-messenger/call-ui/CallConnectingSurface";
import {
  getCallConnectingSurfaceState,
  hideCallConnectingSurfaceAny,
  requestCallConnectingSurface,
  subscribeCallConnectingSurface,
} from "@/lib/community-messenger/call-connecting-surface/call-connecting-surface-store";
import { readIncomingCallPeerSnapshot } from "@/lib/community-messenger/call-connecting-surface/incoming-call-peer-snapshot";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { readNativeCalleeAcceptPendingSessionId } from "@/lib/community-messenger/native-callee-accept-entry";

function isAcceptCallRoutePath(path: string): boolean {
  return path.includes("action=accept") || path.includes("nativeAccept=1");
}

/**
 * 수신 accept 단일 연결 중 surface — route·CallClient와 분리된 표시 전용 SSOT.
 */
export function CallConnectingSurfaceHost() {
  const surface = useSyncExternalStore(
    subscribeCallConnectingSurface,
    getCallConnectingSurfaceState,
    () => null
  );
  const [metaPollTick, setMetaPollTick] = useState(0);
  const snapshot =
    surface != null ? readIncomingCallPeerSnapshot(surface.sessionId) : null;
  void metaPollTick;

  useEffect(() => {
    if (!surface || snapshot) return;
    const id = window.setInterval(() => setMetaPollTick((n) => n + 1), 150);
    return () => window.clearInterval(id);
  }, [surface?.sessionId, snapshot]);

  useEffect(() => {
    const syncPendingAccept = () => {
      const pendingSid = readNativeCalleeAcceptPendingSessionId();
      if (pendingSid) {
        requestCallConnectingSurface(pendingSid, "native_callee_accept_pending");
      }
    };

    syncPendingAccept();

    const onCallRoute = (ev: Event) => {
      const path = (ev as CustomEvent<{ path?: string }>).detail?.path?.trim() ?? "";
      if (!path || !isAcceptCallRoutePath(path)) return;
      const match = path.match(/^\/community-messenger\/calls\/([^/?#]+)/);
      const sid = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
      if (sid) requestCallConnectingSurface(sid, "dibay_call_route");
    };

    window.addEventListener("dibay:call-route", onCallRoute);
    window.addEventListener("dibay:push-route", onCallRoute);
    window.addEventListener("focus", syncPendingAccept);
    document.addEventListener("visibilitychange", syncPendingAccept);

    const offTerminal = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      const sid = ev.sessionId?.trim();
      if (sid) {
        hideCallConnectingSurfaceAny(`terminal:${sid}`);
      } else {
        hideCallConnectingSurfaceAny("terminal");
      }
    });

    return () => {
      offTerminal();
      window.removeEventListener("dibay:call-route", onCallRoute);
      window.removeEventListener("dibay:push-route", onCallRoute);
      window.removeEventListener("focus", syncPendingAccept);
      document.removeEventListener("visibilitychange", syncPendingAccept);
    };
  }, []);

  if (!surface) return null;

  if (!snapshot) {
    return (
      <div
        className="fixed inset-0 z-[2100] flex min-h-0 flex-col bg-[#003D29]"
        data-call-connecting-surface="awaiting_peer_meta"
        data-call-id={surface.sessionId}
      />
    );
  }

  return <CallConnectingSurface snapshot={snapshot} />;
}
