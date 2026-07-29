"use client";

import type { ReactNode } from "react";
import { CommunityMessengerHomeDetailEmpty } from "@/components/community-messenger/home/CommunityMessengerHomeDetailEmpty";
import { MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS } from "@/lib/ui/messenger-split-pane-layout";

type Props = {
  list: ReactNode;
  detail?: ReactNode;
  showDetail: boolean;
  /** hub(768+) vs split room pane */
  splitMode?: "hub" | "split";
  /** BottomNav clearance 포함 shell 높이 */
  reserveBottomNavClearance?: boolean;
};

const SPLIT_MIN_TW = "min-[768px]";

const HUB_SHELL_HEIGHT_WITH_BOTTOM_NAV =
  "md:min-h-[calc(100dvh-var(--app-bottom-nav-height,60px)-var(--sam-header-row-height,52px)-var(--safe-top,0px))]";
/**
 * Split: BottomNav 는 좌측 pane 만 — 셸 전체 높이에서 탭을 빼지 않음.
 * 좌측 목록 clearance 는 list 본문 `MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS` 가 담당.
 * DO NOT use unbounded min-h only — list scroll (`data-messenger-hub-list-scroll`) must stay
 * viewport-bounded (scrollHeight > clientHeight). Hub body must not become the scroller.
 */
const SPLIT_SHELL_HEIGHT_FULL = "min-h-0 h-full max-h-full flex-1 overflow-hidden";
export function CommunityMessengerHomeMasterDetail({
  list,
  detail,
  showDetail,
  splitMode = "hub",
  reserveBottomNavClearance = true,
}: Props) {
  const isSplitRoom = splitMode === "split";
  const shellHeightClass = isSplitRoom
    ? SPLIT_SHELL_HEIGHT_FULL
    : `min-h-0 w-full flex-1 ${reserveBottomNavClearance ? HUB_SHELL_HEIGHT_WITH_BOTTOM_NAV : ""}`;

  /** Split: pane 자체 스크롤 금지(탭·검색 sticky). Hub: pane 스크롤 + sticky chrome. */
  const listPaneClass = isSplitRoom
    ? `${MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS} flex min-h-0 flex-col border-sam-border shrink-0 overflow-hidden`
    : `${MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS} flex min-h-0 flex-col shrink-0 overflow-y-auto overflow-x-hidden`;

  const rightPaneClass = isSplitRoom
    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    : `hidden min-h-0 min-w-0 flex-1 ${SPLIT_MIN_TW}:flex ${SPLIT_MIN_TW}:flex-col overflow-hidden`;

  return (
    <div className={`flex min-h-0 w-full flex-row ${shellHeightClass}`}>
      <div className={listPaneClass}>{list}</div>
      <div className={`${rightPaneClass} min-w-0`}>
        {showDetail && detail ? detail : <CommunityMessengerHomeDetailEmpty />}
      </div>
    </div>
  );
}
