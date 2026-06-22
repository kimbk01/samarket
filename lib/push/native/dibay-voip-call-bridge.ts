"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hardClearActiveCallSession } from "@/lib/call/active-call-session";
import {
  runIncomingCallReject,
  runNativePendingAcceptCall,
} from "@/lib/community-messenger/incoming-call-accept-gateway";
import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";

type VoipCallActionDetail = {
  sessionId?: string;
  action?: string;
};

function handleVoipCallAction(
  router: { replace: (href: string) => void },
  detail: VoipCallActionDetail | undefined,
): void {
  const sessionId = detail?.sessionId?.trim();
  const action = detail?.action?.trim() ?? "";
  if (!sessionId) return;

  if (action === "accept") {
    void runNativePendingAcceptCall(router, sessionId, "native_notification_accept");
    return;
  }

  if (action === "reject_or_end" || action === "reject" || action === "end") {
    void hardClearActiveCallSession(sessionId, "ended");
    void runIncomingCallReject({
      sessionId,
      source: "incoming_overlay_reject",
    });
  }
}

/** iOS CallKit → JS — `dibay:voip-call-action` from DibayPushTokenBridge */
export function useDibayVoipCallBridge(): void {
  const router = useRouter();

  useEffect(() => {
    const onVoipAction = (event: Event) => {
      handleVoipCallAction(router, (event as CustomEvent<VoipCallActionDetail>).detail);
    };
    window.addEventListener("dibay:voip-call-action", onVoipAction);
    return () => window.removeEventListener("dibay:voip-call-action", onVoipAction);
  }, [router]);
}

function DibayVoipCallBridgeHostInner(): null {
  useDibayVoipCallBridge();
  return null;
}

/** V3 Safe Lane: iOS CallKit actions are handled by `CallV3Provider`. */
export function DibayVoipCallBridgeHost(): null {
  if (isDibayCallV3SafeLaneEnabled()) return null;
  return DibayVoipCallBridgeHostInner();
}
