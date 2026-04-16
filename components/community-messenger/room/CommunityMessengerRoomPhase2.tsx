"use client";

import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { useVisualViewportMessengerRoomBox } from "@/lib/ui/use-visual-viewport-messenger-room-box";
import { useMessengerRoomPhase2Controller } from "@/lib/community-messenger/room/phase2";
import { MessengerRoomPhase2ViewProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { MessengerRoomMobileViewportProvider } from "@/components/community-messenger/room/phase2/messenger-room-mobile-viewport-context";
import { CommunityMessengerRoomPhase2Header } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header";
import { CommunityMessengerRoomPhase2AttachmentsAndTrade } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2AttachmentsAndTrade";
import { CommunityMessengerRoomPhase2MessageTimeline } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline";
import { CommunityMessengerRoomPhase2MessageOverlays } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageOverlays";
import { CommunityMessengerRoomPhase2Composer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer";
import { CommunityMessengerRoomPhase2RoomSheets } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets";
import { CommunityMessengerRoomPhase2MemberActionModal } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal";
import { CommunityMessengerRoomPhase2CallLayer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2CallLayer";

export function CommunityMessengerRoomClientPhase2() {
  const room = useMessengerRoomPhase2Controller();
  const isNarrowViewport = useMatchMaxWidthMd();
  const vvBox = useVisualViewportMessengerRoomBox(isNarrowViewport);
  const keyboardOverlapSuppressed = Boolean(isNarrowViewport && vvBox);
  const mobileShellStyle =
    isNarrowViewport && vvBox
      ? ({ maxHeight: vvBox.heightPx } as const)
      : undefined;

  if (room.loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 text-[14px] text-ui-muted">
        채팅방을 불러오는 중입니다.
      </div>
    );
  }

  if (!room.snapshot) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[16px] font-semibold text-ui-fg">채팅방을 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => room.router.replace("/community-messenger?section=chats")}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 text-[14px] font-semibold text-ui-surface"
        >
          {room.t("nav_messenger_home")}
        </button>
      </div>
    );
  }

  const view: MessengerRoomPhase2ViewModel = {
    ...room,
    snapshot: room.snapshot as CommunityMessengerRoomSnapshot,
  };

  return (
    <MessengerRoomMobileViewportProvider value={{ keyboardOverlapSuppressed }}>
      <MessengerRoomPhase2ViewProvider value={view}>
        <div
          data-messenger-shell
          data-cm-room
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)]"
          style={mobileShellStyle}
        >
          <CommunityMessengerRoomPhase2Header />
          <CommunityMessengerRoomPhase2AttachmentsAndTrade />
          <CommunityMessengerRoomPhase2MessageTimeline />
          <CommunityMessengerRoomPhase2MessageOverlays />
          <CommunityMessengerRoomPhase2Composer />
          <CommunityMessengerRoomPhase2RoomSheets />
          <CommunityMessengerRoomPhase2MemberActionModal />
          <CommunityMessengerRoomPhase2CallLayer />
        </div>
      </MessengerRoomPhase2ViewProvider>
    </MessengerRoomMobileViewportProvider>
  );
}
