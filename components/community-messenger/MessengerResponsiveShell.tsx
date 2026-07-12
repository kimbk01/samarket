"use client";

import { usePathname } from "next/navigation";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeMasterDetail } from "@/components/community-messenger/home/CommunityMessengerHomeMasterDetail";
import { MessengerSplitTopBar } from "@/components/community-messenger/MessengerSplitTopBar";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";

type Props = {
  children: React.ReactNode;
};

/**
 * 768px+ — URL roomId 만 바꿔 우측 pane 에 route children 표시 (Telegram형, shell·목록 유지).
 * <768 — children(기존 hub/room full-page).
 */
export function MessengerResponsiveShell({ children }: Props) {
  const pathname = usePathname();
  const roomId = parseCommunityMessengerRoomIdFromPathname(pathname);
  const isWide = useIsMessengerSplitViewport();

  if (!isWide) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-messenger-responsive-shell="mobile">
        {children}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-messenger-responsive-shell="wide"
      data-messenger-room-id={roomId ?? undefined}
    >
      <MessengerSplitTopBar />
      <CommunityMessengerHomeMasterDetail
        splitMode="split"
        reserveBottomNavClearance
        showDetail={Boolean(roomId)}
        list={<CommunityMessengerHome tabletSplitListOnly key="messenger-split-list" />}
        detail={
          roomId ? (
            <div
              key={roomId}
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              data-messenger-split-room-pane=""
            >
              {children}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
