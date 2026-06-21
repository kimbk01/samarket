"use client";

/**
 * Community Messenger 수신 UI — **유일한** 앱 안(in-app) ringing surface.
 *
 * 발신자 표시 SSOT: `initiatorUserId` → `useIncomingCallerDisplay` (session.peerLabel 직접 사용 금지).
 * DO NOT: `IncomingCallView` — 수신 ringing 은 Global 배너 only.
 */

import { useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { IncomingCallSurface } from "@/components/messenger/call/incoming";
import {
  readIncomingCallerDisplaySeed,
  resolveDirectIncomingCallerUserId,
} from "@/lib/community-messenger/incoming-call/incoming-caller-ssot";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { useIncomingCallerDisplay } from "@/components/community-messenger/incoming-call/useIncomingCallerDisplay";

export type CommunityMessengerIncomingCallUiProps = {
  session: CommunityMessengerCallSession;
  viewerUserId: string;
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
    viewerUserId,
    busyReject,
    busyAccept,
    onReject,
    onAccept,
  } = props;
  const { safeT } = useI18n();

  const callerUserId = useMemo(
    () => resolveDirectIncomingCallerUserId(session, viewerUserId),
    [session, viewerUserId]
  );
  const seed = useMemo(
    () => (callerUserId ? readIncomingCallerDisplaySeed(session, callerUserId) : null),
    [session, callerUserId]
  );
  const caller = useIncomingCallerDisplay(callerUserId, seed);

  const peerLabel =
    caller.label.trim() ||
    safeT(session.callKind === "video" ? "cm_ui_incoming_video_ringing" : "cm_ui_incoming_voice_ringing", {
      fallbackKo: session.callKind === "video" ? "영상 통화가 왔습니다" : "전화가 왔습니다",
      fallbackEn: session.callKind === "video" ? "Incoming video call" : "Incoming call",
    });

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
      <IncomingCallSurface
        mode="popup"
        sessionId={session.id}
        peerLabel={peerLabel}
        peerPublicId={caller.publicId}
        peerAvatarUrl={caller.avatarUrl}
        callKind={session.callKind === "video" ? "video" : "voice"}
        busyReject={busyReject}
        busyAccept={busyAccept}
        showStrangerHint={session.peerRelationLabel != null && session.peerRelationLabel !== "mutual_friend"}
        onReject={onReject}
        onAccept={onAccept}
      />
    </div>,
    document.body
  );
}
