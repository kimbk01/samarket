"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { useMessengerTradeKeyboardChrome } from "@/lib/ui/use-messenger-trade-keyboard-chrome";
import { useMessengerUIStore } from "@/lib/community-messenger/stores/useMessengerUIStore";
import { MessengerRoomMobileViewportProvider } from "@/components/community-messenger/room/phase2/messenger-room-mobile-viewport-context";
import { useMessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { CommunityMessengerRoomPass0Shell } from "@/components/community-messenger/room/CommunityMessengerRoomPass0Shell";
import {
  shouldSkipInRoutePass0ForPreRouteOverlay,
} from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import {
  isCmRoomSubtreeEntryPassAdvanced,
  markCmRoomSubtreeEntryPassAdvanced,
  shouldBlockCmRoomStrictEffectReRun,
} from "@/lib/community-messenger/room/cm-room-subtree-stability";
import { scheduleCmRoomPass1ToPass2, scheduleCmRoomPass2IdleExpand } from "@/lib/community-messenger/room/cm-room-pass-scheduler";
import { hasCmRoomTimelineSeedFromPhase1 } from "@/lib/community-messenger/room/cm-room-r5-timeline-mount-instrumentation";
import { bumpCmRoomPhase2DeferredEffect } from "@/lib/community-messenger/room/cm-room-phase2-entry-perf";
import { noteR2M9Stage } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import { CommunityMessengerRoomPass1StableShell } from "@/components/community-messenger/room/CommunityMessengerRoomPass1StableShell";
import { hasCmRoomStableShellPainted } from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";

const CommunityMessengerRoomClientPhase2Body = dynamic(
  () => import("@/components/community-messenger/room/CommunityMessengerRoomClientPhase2Body"),
  { ssr: false, loading: () => null }
);

export function CommunityMessengerRoomClientPhase2() {
  const phase1 = useMessengerRoomClientPhase1Context();
  const isNarrowViewport = useMatchMaxWidthMd();
  const roomId = phase1.roomId?.trim() ?? "";
  const snapshot = phase1.snapshot;
  const hasTimelineSeed = hasCmRoomTimelineSeedFromPhase1(phase1);
  const resolveInitialEntryPass = () => {
    if (isCmRoomSubtreeEntryPassAdvanced(roomId)) return 1;
    return shouldSkipInRoutePass0ForPreRouteOverlay(roomId) ? 1 : 0;
  };
  const [entryPass, setEntryPass] = useState(() => {
    return resolveInitialEntryPass();
  });
  const [phase2BodyReady, setPhase2BodyReady] = useState(() => {
    return resolveInitialEntryPass() >= 1 && hasTimelineSeed;
  });
  const prevEntryRoomRef = useRef(roomId);
  const composerFocused = useMessengerUIStore((s) => s.composerFocused);
  const keyboardOverlapSuppressed = Boolean(isNarrowViewport);
  const { keyboardChromeOpen: messengerKeyboardChromeOpen } = useMessengerTradeKeyboardChrome({
    enabled: isNarrowViewport && Boolean(snapshot),
    composerFocused,
  });

  useEffect(() => {
    if (shouldBlockCmRoomStrictEffectReRun(roomId, "entry_pass_reset")) return;
    if (prevEntryRoomRef.current === roomId) return;
    prevEntryRoomRef.current = roomId;
    if (isCmRoomSubtreeEntryPassAdvanced(roomId)) {
      setEntryPass(1);
      return;
    }
    setEntryPass(shouldSkipInRoutePass0ForPreRouteOverlay(roomId) ? 1 : 0);
  }, [roomId]);

  useLayoutEffect(() => {
    if (!hasTimelineSeed) return;
    void import("@/components/community-messenger/room/CommunityMessengerRoomClientPhase2Body");
  }, [hasTimelineSeed, roomId]);

  useLayoutEffect(() => {
    if (entryPass < 1) {
      setPhase2BodyReady(false);
      return;
    }
    if (hasTimelineSeed) {
      setPhase2BodyReady(true);
      return;
    }
    bumpCmRoomPhase2DeferredEffect();
    return scheduleCmRoomPass2IdleExpand(() => {
      setPhase2BodyReady(true);
    }, 120);
  }, [entryPass, hasTimelineSeed, roomId]);

  const advanceFromPass0 = useCallback(() => {
    if (roomId) markCmRoomSubtreeEntryPassAdvanced(roomId);
    setEntryPass(1);
  }, [roomId]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <MessengerRoomMobileViewportProvider
        value={{ keyboardOverlapSuppressed, messengerKeyboardChromeOpen }}
      >
        <div
          className={
            entryPass < 1
              ? "pointer-events-none invisible absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col"
              : "flex min-h-0 min-w-0 flex-1 flex-col"
          }
          aria-hidden={entryPass < 1}
          data-cm-room-phase2-persistent=""
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {phase2BodyReady ? (
              <CommunityMessengerRoomClientPhase2Body
                keyboardOverlapSuppressed={keyboardOverlapSuppressed}
                messengerKeyboardChromeOpen={messengerKeyboardChromeOpen}
              />
            ) : entryPass >= 1 && roomId && !hasCmRoomStableShellPainted(roomId) ? (
              <CommunityMessengerRoomPass1StableShell
                roomId={roomId}
                narrowViewport={isNarrowViewport}
                composerEntryVisible
              />
            ) : entryPass >= 1 && roomId ? (
              <div
                className="min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]"
                aria-hidden
                data-cm-room-body-deferred=""
              />
            ) : (
              <div
                className="min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]"
                aria-hidden
                data-cm-room-body-deferred=""
              />
            )}
          </div>
        </div>
      </MessengerRoomMobileViewportProvider>
      {entryPass === 0 && roomId ? (
        <div className="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <CommunityMessengerRoomPass0Shell
            roomId={roomId}
            narrowViewport={isNarrowViewport}
            onAdvance={advanceFromPass0}
          />
        </div>
      ) : null}
    </div>
  );
}
