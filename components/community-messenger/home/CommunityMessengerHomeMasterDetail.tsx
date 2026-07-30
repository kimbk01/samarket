"use client";

import type { ReactNode } from "react";
import { CommunityMessengerHomeDetailEmpty } from "@/components/community-messenger/home/CommunityMessengerHomeDetailEmpty";
import { MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS } from "@/lib/ui/messenger-split-pane-layout";

type Props = {
  list: ReactNode;
  detail?: ReactNode;
  showDetail: boolean;
  /**
   * hub = portrait / <768 full list (우측 pane 숨김).
   * split = 768+ landscape only — JS `useIsMessengerSplitViewport` 가 이미 게이트.
   * safe-top: hub=StickyHeader · split=SplitTopBar.
   */
  splitMode?: "hub" | "split";
  /** @deprecated 스크롤 권위는 list SSOT — 호출부 호환용 no-op */
  reserveBottomNavClearance?: boolean;
};

/**
 * CONTRACT — list pane 은 hub/split 모두 `overflow-hidden`.
 * 스크롤 SSOT: `[data-messenger-hub-list-scroll]` 만.
 * DO NOT hub 에 min-[768px]:flex 우측 pane — 세로 태블릿에서 빈 detail 이 떠서 list 높이·스크롤이 깨짐.
 * DO NOT pane `overflow-y-auto` — pane 이 스크롤러가 되면 list ch===sh → BottomNav hide 실패.
 */
const LIST_PANE_SPLIT_CLASS = `${MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS} flex min-h-0 flex-col overflow-hidden`;
const LIST_PANE_HUB_CLASS =
  "flex min-h-0 w-full flex-1 flex-col overflow-hidden border-sam-border";

/**
 * 높이 체인 — viewport-lock 부모 안에서 h-full 로 가둠.
 * DO NOT unbounded min-h only — list 가 콘텐츠 높이로 팽창함.
 */
const SHELL_HEIGHT_CLASS = "min-h-0 h-full max-h-full w-full flex-1 overflow-hidden";

export function CommunityMessengerHomeMasterDetail({
  list,
  detail,
  showDetail,
  splitMode = "hub",
}: Props) {
  const isSplitRoom = splitMode === "split";
  const listPaneClass = isSplitRoom ? LIST_PANE_SPLIT_CLASS : LIST_PANE_HUB_CLASS;

  /** hub: 우측 절대 숨김. split: flex detail (미디어 쿼리로 다시 켜지 않음). */
  const rightPaneClass = isSplitRoom
    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    : "hidden";

  return (
    <div
      className={`flex min-h-0 w-full flex-row ${SHELL_HEIGHT_CLASS}`}
      data-messenger-master-detail={splitMode}
    >
      <div className={listPaneClass}>{list}</div>
      <div className={`${rightPaneClass} min-w-0`}>
        {isSplitRoom ? (showDetail && detail ? detail : <CommunityMessengerHomeDetailEmpty />) : null}
      </div>
    </div>
  );
}
