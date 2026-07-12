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
const SPLIT_SHELL_HEIGHT_WITH_BOTTOM_NAV =
  "min-h-0 flex-1 min-h-[calc(100dvh-var(--app-bottom-nav-height,60px)-var(--sector-header-h,52px)-var(--safe-top,0px))]";

export function CommunityMessengerHomeMasterDetail({
  list,
  detail,
  showDetail,
  splitMode = "hub",
  reserveBottomNavClearance = true,
}: Props) {
  const isSplitRoom = splitMode === "split";
  const shellHeightClass = isSplitRoom
    ? reserveBottomNavClearance
      ? SPLIT_SHELL_HEIGHT_WITH_BOTTOM_NAV
      : "min-h-0 flex-1"
    : `min-h-0 w-full flex-1 ${reserveBottomNavClearance ? HUB_SHELL_HEIGHT_WITH_BOTTOM_NAV : ""}`;

  const listPaneClass = isSplitRoom
    ? `${MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS} border-sam-border shrink-0 overflow-y-auto overflow-x-hidden min-h-0`
    : `w-full md:w-[min(420px,38vw)] md:max-w-[420px] md:min-w-[min(320px,32vw)] md:border-r border-sam-border shrink-0 overflow-y-auto overflow-x-hidden min-h-0`;

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
