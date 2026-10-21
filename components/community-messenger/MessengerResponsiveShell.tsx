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
import { MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY } from "@/lib/community-messenger/messenger-entry-origin";
import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";
import { resolveMessengerSplitListScope } from "@/lib/community-messenger/messenger-split-list-scope";

type Props = {
  children: React.ReactNode;
};

const MESSENGER_SHELL_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
const SPLIT_DETAIL_PANE_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
/** 분할 목록 래퍼 — 방이 열려 있을 때만 상단바 높이만큼 내림. 요소는 항상 같은 div (SPL-02) */
const SPLIT_LIST_WRAP_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
const SPLIT_LIST_WRAP_ROOM_CLASS = `${SPLIT_LIST_WRAP_CLASS} pt-[calc(var(--sector-header-h,52px)+var(--safe-top))]`;

function normalizePath(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.replace(/\/+$/, "") ?? "";
}

/** 통화 기록 — 분할에서는 우측 패널에 표시 (SPL-03) */
export function isMessengerSplitCallLogsPath(pathname: string | null | undefined): boolean {
  return normalizePath(pathname) === "/community-messenger/calls/logs";
}

/**
 * 통화 화면(`/calls/:id`·outgoing·v3·v4) — 분할을 쓰지 않고 휴대폰과 같은 전체 화면 (SPL-03).
 * 통화 표현(통화 HARD LOCK D)은 그대로 — 셸만 좁은 화면 경로로 보낸다.
 */
export function isMessengerFullScreenCallPath(pathname: string | null | undefined): boolean {
  const p = normalizePath(pathname);
  if (isMessengerSplitCallLogsPath(p)) return false;
  return (
    p.startsWith("/community-messenger/calls/") ||
    p.startsWith("/community-messenger/calls-v3/") ||
    p.startsWith("/community-messenger/calls-v4/")
  );
}

function MessengerResponsiveBody({ children, isWide }: Props & { isWide: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomId = parseCommunityMessengerRoomIdFromPathname(pathname);
  const callLogs = isMessengerSplitCallLogsPath(pathname);
  const detailOverrideApi = useMessengerSplitDetailOverride();
  const detailOverride = isWide ? (detailOverrideApi?.detailOverride ?? null) : null;
  const scope = resolveMessengerSplitListScope({
    pathname,
    cmList: searchParams.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY),
  });

  const routeDetailKey = roomId ? `room:${roomId}` : callLogs ? "call-logs" : null;
  const showDetail = Boolean(detailOverride) || routeDetailKey != null;

  const detail = useMemo((): ReactNode | undefined => {
    if (detailOverride) {
      return (
        <div className={SPLIT_DETAIL_PANE_CLASS} data-messenger-split-call-peer-pane="">
          {detailOverride}
        </div>
      );
    }
    if (routeDetailKey) {
      /**
       * 방 내용의 React 위치는 좁은 화면·분할 모두 이 key 슬롯 하나 —
       * 768px 경계를 넘어도 방 클라이언트가 다시 마운트되지 않는다 (입력 초안·구독·시트 유지, SPL-01).
       */
      return (
        <div
          key={routeDetailKey}
          className={SPLIT_DETAIL_PANE_CLASS}
          data-messenger-split-room-pane={isWide ? "" : undefined}
        >
          {children}
        </div>
      );
    }
    return undefined;
  }, [children, detailOverride, routeDetailKey, isWide]);

  return (
    <div
      className={MESSENGER_SHELL_CLASS}
      data-messenger-responsive-shell={isWide ? "wide" : "mobile"}
      data-messenger-room-id={roomId ?? undefined}
      data-messenger-list-scope={isWide ? scope : undefined}
    >
      {isWide ? <MessengerSplitTopBar /> : null}
      <CommunityMessengerHomeMasterDetail
        splitMode="split"
        reserveBottomNavClearance
        showDetail={showDetail}
        listHidden={!isWide}
        list={
          isWide ? (
            <div className={roomId ? SPLIT_LIST_WRAP_ROOM_CLASS : SPLIT_LIST_WRAP_CLASS}>
              <MessengerSplitListPane scope={scope} />
            </div>
          ) : null
        }
        detail={detail}
      />
    </div>
  );
}

/**
 * 768px+ — URL roomId 만 바꿔 우측 pane 에 route children 표시 (Telegram형, shell·목록 유지).
 * 통화 peer 상세는 detail override 로 우측 pane 에 임베드. 통화 기록은 우측 pane, 통화 화면은 전체 화면.
 * <768 — 방 경로는 분할과 같은 트리(목록 슬롯만 숨김), 그 외는 기존 hub/page full-page.
 */
export function MessengerResponsiveShell({ children }: Props) {
  const isWide = useIsMessengerSplitViewport();
  const pathname = usePathname();
  const isRoomRoute = parseCommunityMessengerRoomIdFromPathname(pathname) != null;

  if (isMessengerFullScreenCallPath(pathname) || (!isWide && !isRoomRoute)) {
    return (
      <div className={MESSENGER_SHELL_CLASS} data-messenger-responsive-shell="mobile">
        {children}
      </div>
    );
  }

  return (
    <MessengerSplitDetailOverrideProvider>
      <Suspense fallback={<CommunityMessengerHomeReturnConsume />}>
        <MessengerResponsiveBody isWide={isWide}>{children}</MessengerResponsiveBody>
      </Suspense>
    </MessengerSplitDetailOverrideProvider>
  );
}
