"use client";

import { memo, useCallback, useLayoutEffect, useRef } from "react";
import { CommunityMessengerRoomShellChromeFrame } from "@/components/community-messenger/room/CommunityMessengerRoomShellChromeFrame";
import {
  emitCmRoomPass0ShellLog,
  measureCmPassRenderCommit,
} from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import { scheduleCmRoomPass0ToPass1 } from "@/lib/community-messenger/room/cm-room-pass-scheduler";
import { isCmPreRouteShellOverlayActiveForRoom } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import { noteCmRoomEntryShellFirstPaint } from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";
import { shouldBlockCmRoomStrictEffectReRun } from "@/lib/community-messenger/room/cm-room-subtree-stability";
import { useMessengerRoomEntryHeaderSeed } from "@/lib/community-messenger/room/use-messenger-room-entry-header-seed";

type CommunityMessengerRoomPass0ShellProps = {
  roomId: string;
  narrowViewport: boolean;
  onAdvance: () => void;
};

/** In-route PASS-0 — PRE-ROUTE overlay 가 이미 떠 있으면 생략된다. */
export const CommunityMessengerRoomPass0Shell = memo(function CommunityMessengerRoomPass0Shell({
  roomId,
  narrowViewport,
  onAdvance,
}: CommunityMessengerRoomPass0ShellProps) {
  const renderStartRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  renderStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  const advancedRef = useRef(false);
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  const headerSeed = useMessengerRoomEntryHeaderSeed(roomId);

  const advanceOnce = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvanceRef.current();
  }, []);

  useLayoutEffect(() => {
    const skipEmit = shouldBlockCmRoomStrictEffectReRun(roomId, "pass0_shell_emit");
    if (!skipEmit) {
      if (isCmPreRouteShellOverlayActiveForRoom(roomId)) {
        /* pre-route overlay already logged shell */
      } else {
        emitCmRoomPass0ShellLog(roomId);
      }
      measureCmPassRenderCommit(0, renderStartRef.current);
      noteCmRoomEntryShellFirstPaint(roomId);
    }
    return scheduleCmRoomPass0ToPass1(advanceOnce);
  }, [advanceOnce, roomId]);

  return (
    <CommunityMessengerRoomShellChromeFrame
      narrowViewport={narrowViewport}
      headerSeed={headerSeed}
      dataAttrs={{
        "data-messenger-shell": "",
        "data-cm-room": "",
        "data-cm-room-pass0": "",
      }}
    />
  );
});
