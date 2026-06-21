"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IncomingCallBanner } from "@/components/messenger/call/IncomingCallBanner";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type ForegroundIncomingCallHostProps = {
  shouldRender: boolean;
  session: CommunityMessengerCallSession | null;
  ringTimeoutSeconds: number;
  busyReject: boolean;
  busyAccept: boolean;
  busyBlock?: boolean;
  onExpand?: () => void;
  onReject: () => void;
  onAccept: () => void;
  onBlock?: () => void;
};

/**
 * Foreground 수신 배너 전용 호스트 — 정책 없음, body 포털 + z-index 고정.
 */
export function ForegroundIncomingCallHost(props: ForegroundIncomingCallHostProps) {
  const {
    shouldRender,
    session,
    ringTimeoutSeconds,
    busyReject,
    busyAccept,
    busyBlock = false,
    onExpand,
    onReject,
    onAccept,
    onBlock,
  } = props;

  const [portalReady, setPortalReady] = useState(false);
  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  if (!shouldRender || !session) return null;
  if (typeof document === "undefined" || !portalReady) return null;

  const banner = (
    <div
      data-foreground-incoming-call-host
      className={`pointer-events-none fixed inset-x-0 top-0 ${MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS}`}
    >
      <IncomingCallBanner
        sessionId={session.id}
        peerLabel={session.peerLabel}
        peerAvatarUrl={session.peerAvatarUrl ?? null}
        callKind={session.callKind === "video" ? "video" : "voice"}
        ringTimeoutSeconds={ringTimeoutSeconds}
        startedAt={session.startedAt ?? null}
        busyReject={busyReject}
        busyAccept={busyAccept}
        showStrangerHint={session.peerRelationLabel != null && session.peerRelationLabel !== "mutual_friend"}
        busyBlock={busyBlock}
        onExpand={onExpand}
        onReject={onReject}
        onAccept={onAccept}
        onBlock={onBlock}
      />
    </div>
  );

  return createPortal(banner, document.body);
}
