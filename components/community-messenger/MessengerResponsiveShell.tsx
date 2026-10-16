"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CommunityMessengerHomeMasterDetail } from "@/components/community-messenger/home/CommunityMessengerHomeMasterDetail";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { consumeCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";
import {
  MessengerSplitDetailOverrideProvider,
  useMessengerSplitDetailOverride,
} from "@/components/community-messenger/MessengerSplitDetailOverrideContext";
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
  const detailOverrideApi = useMessengerSplitDetailOverride();
  const detailOverride = detailOverrideApi?.detailOverride ?? null;
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
    >
      <MessengerSplitTopBar />
      <CommunityMessengerHomeMasterDetail
        splitMode="split"
        reserveBottomNavClearance
        showDetail={showDetail}
        list={
          roomId ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-[calc(var(--sector-header-h,52px)+var(--safe-top))]">
              <MessengerSplitListPane scope={scope} />
            </div>
          ) : (
            <MessengerSplitListPane scope={scope} />
          )
        }
        detail={detail}
      />
    </div>
  );
}

const MESSENGER_HUB_PATHNAME = "/community-messenger";

function isMessengerHubPathname(pathname: string | null): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "");
  return p === MESSENGER_HUB_PATHNAME;
}

/**
 * <768 — 카톡·텔레그램형: 메신저 홈(목록)을 레이아웃에서 계속 살려 두고, 홈에서 연 채팅방은 그 위에 덮는다
 * (`.messenger-room-page` fixed). 방 진입 슬라이드·뒤로 스와이프·방 로딩 중에 빈 화면 대신 실제 목록이 보이고,
 * 돌아올 때 목록을 다시 만들지 않는다(스크롤·상태 유지).
 * - 홈 경로: 홈 표시(hub page 는 모바일에서 null — `MessengerHubRouteGate`).
 * - 방 경로: 이 셸에서 홈이 이미 떠 있었고 인박스 목록에서 연 방일 때만 홈을 아래에 유지(inert·aria-hidden).
 *   알림 등으로 방에 바로 들어온 경우(cold)·거래/배달 목록에서 연 방은 홈을 새로 띄우지 않는다(방 로딩 경쟁 방지).
 */
function MessengerMobileShellBody({ children }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomId = parseCommunityMessengerRoomIdFromPathname(pathname);
  const onHub = isMessengerHubPathname(pathname);
  const scope = resolveMessengerSplitListScope({
    pathname,
    cmList: searchParams.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY),
  });
  const [hubMounted, setHubMounted] = useState(onHub);
  useEffect(() => {
    if (onHub) setHubMounted(true);
    else if (!roomId) setHubMounted(false);
  }, [onHub, roomId]);
  const underRoom = Boolean(roomId) && hubMounted && scope === "inbox";
  const showHub = onHub || underRoom;

  /** 방 → 홈 복귀: 홈은 계속 살아 있으므로 복귀 계측 표식을 여기서 소비(재마운트 경로와 동일 시점). */
  const [prevRoomId, setPrevRoomId] = useState<string | null>(roomId);
  useLayoutEffect(() => {
    if (prevRoomId && !roomId && onHub) consumeCommunityMessengerHomeReturn();
    if (prevRoomId !== roomId) setPrevRoomId(roomId);
  }, [onHub, prevRoomId, roomId]);

  const hubInitialTab = searchParams.get("tab")?.trim() || undefined;
  const hubInitialSection = searchParams.get("section")?.trim() || undefined;
  const hubInitialFilter =
    searchParams.get("inbox")?.trim() || searchParams.get("filter")?.trim() || undefined;
  const hubInitialKind = searchParams.get("kind")?.trim() || undefined;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-messenger-responsive-shell="mobile">
      {showHub ? (
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          data-messenger-persistent-hub={underRoom ? "under-room" : "active"}
          inert={underRoom ? true : undefined}
          aria-hidden={underRoom ? true : undefined}
        >
          <CommunityMessengerHome
            initialTab={hubInitialTab}
            initialSection={hubInitialSection}
            initialFilter={hubInitialFilter}
            initialKind={hubInitialKind}
          />
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * 768px+ — URL roomId 만 바꿔 우측 pane 에 route children 표시 (Telegram형, shell·목록 유지).
 * 통화 peer 상세는 detail override 로 우측 pane 에 임베드.
 * <768 — children(기존 hub/room full-page).
 */
export function MessengerResponsiveShell({ children }: Props) {
  const isWide = useIsMessengerSplitViewport();

  if (!isWide) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-messenger-responsive-shell="mobile">
            {children}
          </div>
        }
      >
        <MessengerMobileShellBody>{children}</MessengerMobileShellBody>
      </Suspense>
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
