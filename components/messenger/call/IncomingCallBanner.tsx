"use client";

import { IncomingCallSurface } from "@/components/messenger/call/IncomingCallSurface";

export type IncomingCallBannerProps = {
  sessionId: string;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  callKind?: "voice" | "video";
  startedAt?: string | null;
  ringTimeoutSeconds?: number | null;
  busyReject: boolean;
  busyAccept: boolean;
  showStrangerHint?: boolean;
  busyBlock?: boolean;
  onReject: () => void;
  onAccept: () => void;
  onBlock?: () => void;
};

/** @deprecated Use `IncomingCallSurface`. Kept as a thin wrapper for external imports. */
export function IncomingCallBanner(props: IncomingCallBannerProps) {
  const {
    sessionId,
    peerLabel,
    peerAvatarUrl,
    callKind = "voice",
    busyReject,
    busyAccept,
    showStrangerHint = false,
    onReject,
    onAccept,
  } = props;

  return (
    <IncomingCallSurface
      mode="popup"
      sessionId={sessionId}
      peerLabel={peerLabel}
      peerAvatarUrl={peerAvatarUrl}
      callKind={callKind}
      showStrangerHint={showStrangerHint}
      busyReject={busyReject}
      busyAccept={busyAccept}
      onReject={onReject}
      onAccept={onAccept}
    />
  );
}
