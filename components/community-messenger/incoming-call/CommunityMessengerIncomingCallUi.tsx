"use client";

/**
 * Community Messenger 수신 UI — **유일한** 앱 안(in-app) ringing surface.
 *
 * | 상태 | UI | 파일 |
 * |------|-----|------|
 * | Foreground unlocked | compact top banner (카톡/텔레그램) | **이 파일** + `IncomingCallBanner` |
 * | Lock / background | native fullscreen | Android `IncomingCallActivity` |
 * | 수락 후 | CallClient connecting/active | `CommunityMessengerCallClient` |
 *
 * DO NOT: `IncomingCallView` 전체화면 · native foreground pill · CallClient ringing 벨 UI.
 * 정책 SSOT: `lib/community-messenger/incoming-call/`
 */

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IncomingCallBanner } from "@/components/messenger/call/IncomingCallBanner";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CommunityMessengerIncomingCallUiProps = {
  session: CommunityMessengerCallSession;
  ringTimeoutSeconds: number;
  busyReject: boolean;
  busyAccept: boolean;
  busyBlock?: boolean;
  onReject: () => void;
  onAccept: () => void;
  onBlock?: () => void;
};

export function CommunityMessengerIncomingCallUi(props: CommunityMessengerIncomingCallUiProps) {
  const {
    session,
    ringTimeoutSeconds,
    busyReject,
    busyAccept,
    busyBlock = false,
    onReject,
    onAccept,
    onBlock,
  } = props;

  const [portalReady, setPortalReady] = useState(false);
  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  if (typeof document === "undefined" || !portalReady) return null;

  return createPortal(
    <div
      data-cm-incoming-call-ui
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
        onReject={onReject}
        onAccept={onAccept}
        onBlock={onBlock}
      />
    </div>,
    document.body
  );
}
