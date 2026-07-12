"use client";

import { useParams } from "next/navigation";
import { CommunityMessengerRoomShellChromeFrame } from "@/components/community-messenger/room/CommunityMessengerRoomShellChromeFrame";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { useMessengerRoomEntryHeaderSeed } from "@/lib/community-messenger/room/use-messenger-room-entry-header-seed";

/**
 * BN14-2 — route segment inline shell (client boundary).
 * Server layout imports this component; SSR paints gray fallback, client hydrate applies entry seed.
 */
export function CommunityMessengerRoomLayoutInlineShell() {
  const roomId = String(useParams()?.roomId ?? "").trim();
  const headerSeed = useMessengerRoomEntryHeaderSeed(roomId);
  const isMessengerSplit = useIsMessengerSplitViewport();

  if (isMessengerSplit) return null;

  return (
    <CommunityMessengerRoomShellChromeFrame
      narrowViewport
      screenReaderHidden={false}
      headerSeed={headerSeed}
      dataAttrs={{
        "data-messenger-shell": "",
        "data-cm-room": "",
        "data-cm-room-route-entry-shell": "",
        "data-cm-room-pass1-stable-shell": "",
        "data-cm-room-layout-inline-shell": "",
      }}
    />
  );
}
