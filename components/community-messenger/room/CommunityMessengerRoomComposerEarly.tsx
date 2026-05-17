"use client";

import { memo, useLayoutEffect } from "react";
import { CommunityMessengerRoomPass1ComposerShell } from "@/components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell";
import { MessengerRoomComposerEarlyContext } from "@/lib/community-messenger/room/messenger-room-composer-early-context";
import { useMessengerRoomComposerEarly } from "@/lib/community-messenger/room/use-messenger-room-composer-early";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import {
  noteR2M9Stage,
  noteR2M9SyncWork,
} from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";

/** PRE-ROUTE opening overlay(`CommunityMessengerRoomOpeningOverlayHost`) 보다 위 — 실제 textarea 유지 */
const COMPOSER_EARLY_Z = "z-[130]";

if (typeof window !== "undefined") {
  noteR2M9Stage("composer_early_module_eval");
}

/** Inner(phase1) 마운트 전 textarea 선커밋 — full phase1 hook 과 형제 트리. */
export const CommunityMessengerRoomComposerEarly = memo(function CommunityMessengerRoomComposerEarly({
  roomId,
  initialViewerUserId,
}: {
  roomId: string;
  initialViewerUserId?: string | null;
}) {
  const vm = useMessengerRoomComposerEarly({ roomId, initialViewerUserId });
  const rid = roomId.trim();

  useLayoutEffect(() => {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    noteR2M9Stage("composer_early_layout_commit");
    if (t0 > 0) noteR2M9SyncWork("composer_early_layout", t0);
    if (!rid) return;
    const overlay = useCmRoomOpeningOverlayStore.getState();
    if (overlay.openingRoomId === rid) {
      overlay.noteHydrationComplete(rid);
      overlay.beginHandoff(rid);
    }
  }, [rid]);
  if (!rid) return null;

  return (
    <MessengerRoomComposerEarlyContext.Provider value={vm}>
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 ${COMPOSER_EARLY_Z} flex flex-col justify-end`}
        data-cm-room
      >
        <div className="pointer-events-auto">
          <CommunityMessengerRoomPass1ComposerShell composerEntryVisible />
        </div>
      </div>
    </MessengerRoomComposerEarlyContext.Provider>
  );
});
