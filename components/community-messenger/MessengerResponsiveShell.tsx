"use client";

import { Suspense, useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CommunityMessengerHomeMasterDetail } from "@/components/community-messenger/home/CommunityMessengerHomeMasterDetail";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import {
  MessengerSplitDetailOverrideProvider,
  useMessengerSplitDetailOverride,
} from "@/components/community-messenger/MessengerSplitDetailOverrideContext";
import { MessengerSplitListPane } from "@/components/community-messenger/MessengerSplitListPane";
import { MessengerSplitTopBar } from "@/components/community-messenger/MessengerSplitTopBar";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { useMessengerHubSurfaceDataAttrs } from "@/hooks/use-messenger-hub-surface";
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
  const detailOverrideApi = useMessengerSplitDetailOverride();
  const detailOverride = detailOverrideApi?.detailOverride ?? null;
  const surfaceAttrs = useMessengerHubSurfaceDataAttrs();
  const scope = resolveMessengerSplitListScope({
    pathname,
    cmList: searchParams.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY),
  });

  const showDetail = Boolean(detailOverride) || Boolean(roomId);

  const detail = useMemo((): ReactNode | undefined => {
    if (detailOverride) {
      return (
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          data-messenger-split-call-peer-pane=""
        >
          {detailOverride}
        </div>
      );
    }
    if (roomId) {
      return (
        <div
          key={roomId}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          data-messenger-split-room-pane=""
        >
          {children}
        </div>
      );
    }
    return undefined;
  }, [children, detailOverride, roomId]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-messenger-responsive-shell="wide"
      data-messenger-room-id={roomId ?? undefined}
      data-messenger-list-scope={scope}
      {...surfaceAttrs}
    >
      <MessengerSplitTopBar />
      <CommunityMessengerHomeMasterDetail
        splitMode="split"
        reserveBottomNavClearance
        showDetail={showDetail}
        list={<MessengerSplitListPane scope={scope} />}
        detail={detail}
      />
    </div>
  );
}

/**
 * split = 768+ **AND** landscape only.
 * portrait(폰·태블릿) · window 세로 = mobile hub children (전폭 스크롤).
 */
export function MessengerResponsiveShell({ children }: Props) {
  const isWide = useIsMessengerSplitViewport();
  const surfaceAttrs = useMessengerHubSurfaceDataAttrs();

  if (!isWide) {
    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        data-messenger-responsive-shell="mobile"
        {...surfaceAttrs}
      >
        {children}
      </div>
    );
  }

  return (
    <MessengerSplitDetailOverrideProvider>
      <Suspense fallback={<CommunityMessengerHomeReturnConsume />}>
        <MessengerWideShellBody>{children}</MessengerWideShellBody>
      </Suspense>
    </MessengerSplitDetailOverrideProvider>
  );
}
