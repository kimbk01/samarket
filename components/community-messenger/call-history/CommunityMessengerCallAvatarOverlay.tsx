"use client";

import type { ReactNode } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import type { CallHistoryAvatarOverlayKind } from "@/lib/community-messenger/call-history/call-history-presenter";

const OVERLAY_GREEN = "#006241";
const OVERLAY_RED = "#E53935";

type Props = {
  overlayKind: CallHistoryAvatarOverlayKind;
  children: ReactNode;
};

export function CommunityMessengerCallAvatarOverlay({ overlayKind, children }: Props) {
  const missedRing = overlayKind === "missed";

  return (
    <div className="relative shrink-0">
      <div className={`rounded-full ${missedRing ? "ring-2 ring-[#E53935]" : ""}`}>{children}</div>
      {overlayKind === "outgoing" ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-1 ring-sam-border"
          aria-hidden
        >
          <PhoneOutgoing className="h-3 w-3" style={{ color: OVERLAY_GREEN }} />
        </span>
      ) : null}
      {overlayKind === "incoming" ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-1 ring-sam-border"
          aria-hidden
        >
          <PhoneIncoming className="h-3 w-3" style={{ color: OVERLAY_GREEN }} />
        </span>
      ) : null}
      {overlayKind === "missed" ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-1 ring-[#E53935]"
          aria-hidden
        >
          <Phone className="h-3 w-3" style={{ color: OVERLAY_RED }} />
        </span>
      ) : null}
    </div>
  );
}
