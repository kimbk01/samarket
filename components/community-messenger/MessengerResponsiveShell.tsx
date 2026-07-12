"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CommunityMessengerHomeMasterDetail } from "@/components/community-messenger/home/CommunityMessengerHomeMasterDetail";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { MessengerSplitListPane } from "@/components/community-messenger/MessengerSplitListPane";
import { MessengerSplitTopBar } from "@/components/community-messenger/MessengerSplitTopBar";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY } from "@/lib/community-messenger/messenger-entry-origin";
import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";
import { resolveMessengerSplitListScope } from "@/lib/community-messenger/messenger-split-list-scope";

type Props = {
  children: React.ReactNode;
};

function MessengerWideShellBody({ children }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomId = parseCommunityMessengerRoomIdFromPathname(pathname);
  const scope = resolveMessengerSplitListScope({
    pathname,
    cmList: searchParams.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY),
  });

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-messenger-responsive-shell="wide"
      data-messenger-room-id={roomId ?? undefined}
      data-messenger-list-scope={scope}
    >
      <MessengerSplitTopBar />
      <CommunityMessengerHomeMasterDetail
        splitMode="split"
        reserveBottomNavClearance
        showDetail={Boolean(roomId)}
        list={<MessengerSplitListPane scope={scope} />}
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

/**
 * 768px+ — URL roomId 만 바꿔 우측 pane 에 route children 표시 (Telegram형, shell·목록 유지).
 * <768 — children(기존 hub/room full-page).
 */
export function MessengerResponsiveShell({ children }: Props) {
  const isWide = useIsMessengerSplitViewport();

  if (!isWide) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-messenger-responsive-shell="mobile">
        {children}
      </div>
    );
  }

  return (
    <Suspense fallback={<CommunityMessengerHomeReturnConsume />}>
      <MessengerWideShellBody>{children}</MessengerWideShellBody>
    </Suspense>
  );
}
