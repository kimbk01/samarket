"use client";

import { useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";
import { beginCmRoomEntryShellFirstPass } from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";
import { CommunityMessengerRoomStableEntryShellLight } from "@/components/community-messenger/room/CommunityMessengerRoomStableEntryShellLight";
import { MessengerRoomBn14DirectColdDomProbe } from "@/components/community-messenger/room/MessengerRoomBn14DirectColdDomProbe";

if (typeof window !== "undefined") {
  noteBn14DirectColdMark("segment_layout_module_eval");
}

/**
 * BN13-rsc 4차 — client persistence host (보조·warm 경로).
 * BN14-2 canonical shell: `CommunityMessengerRoomLayoutInlineShell` + `LayoutShellClientBridge`.
 */
export function CommunityMessengerRoomSegmentShellLayout({ children }: { children: React.ReactNode }) {
  const rid = String(useParams()?.roomId ?? "").trim();

  useLayoutEffect(() => {
    noteBn14DirectColdMark("segment_layout_mount");
  }, []);

  if (rid) {
    beginCmRoomEntryShellFirstPass(rid);
  }

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      data-cm-room-segment-layout=""
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col"
        data-cm-room-segment-shell-host=""
      >
        {rid ? (
          <CommunityMessengerRoomStableEntryShellLight roomId={rid} variant="entry" recordShellPaint />
        ) : null}
      </div>
      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
        <MessengerRoomBn14DirectColdDomProbe />
        {children}
      </div>
    </div>
  );
}
