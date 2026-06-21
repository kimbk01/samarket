"use client";

import { IncomingCallPopup } from "./IncomingCallPopup";
import { IncomingCallFullScreen } from "./IncomingCallFullScreen";

export type IncomingCallSurfaceMode = "popup" | "fullscreen";

export type IncomingCallSurfaceProps = {
  mode?: IncomingCallSurfaceMode;
  sessionId: string;
  peerLabel: string;
  peerPublicId?: string | null;
  peerAvatarUrl?: string | null;
  callKind: "voice" | "video";
  showStrangerHint?: boolean;
  busyReject: boolean;
  busyAccept: boolean;
  exiting?: boolean;
  onReject: () => void;
  onAccept: () => void;
};

/** 단일 Web 수신 UI surface. Owner 결정은 Global/foreground presenter에서만 수행한다. */
export function IncomingCallSurface({
  mode = "popup",
  peerLabel,
  peerPublicId,
  peerAvatarUrl,
  callKind,
  showStrangerHint,
  busyReject,
  busyAccept,
  exiting = false,
  onReject,
  onAccept,
}: IncomingCallSurfaceProps) {
  if (mode === "fullscreen") {
    return (
      <IncomingCallFullScreen
        peerLabel={peerLabel}
        peerPublicId={peerPublicId}
        peerAvatarUrl={peerAvatarUrl}
        callKind={callKind}
        busyReject={busyReject}
        busyAccept={busyAccept}
        onReject={onReject}
        onAccept={onAccept}
      />
    );
  }

  return (
    <IncomingCallPopup
      peerLabel={peerLabel}
      peerPublicId={peerPublicId}
      peerAvatarUrl={peerAvatarUrl}
      callKind={callKind}
      showStrangerHint={showStrangerHint}
      busyReject={busyReject}
      busyAccept={busyAccept}
      exiting={exiting}
      onReject={onReject}
      onAccept={onAccept}
    />
  );
}
