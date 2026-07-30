"use client";

import type { ReactNode } from "react";
import { CommunityMessengerHomeDetailEmpty } from "@/components/community-messenger/home/CommunityMessengerHomeDetailEmpty";
import { MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS } from "@/lib/ui/messenger-split-pane-layout";

type Props = {
  list: ReactNode;
  detail?: ReactNode;
  showDetail: boolean;
  /** hub(모바일 MasterDetail) vs split(≥768 room/list shell) — safe-top 담당은 각자 유지 */
  splitMode?: "hub" | "split";
  /** @deprecated 스크롤 권위는 list SSOT — 호출부 호환용 no-op */
  reserveBottomNavClearance?: boolean;
};

const SPLIT_MIN_TW = "min-[768px]";

/**
 * CONTRACT — list pane 은 hub/split 모두 `overflow-hidden`.
 * 스크롤 SSOT: `[data-messenger-hub-list-scroll]` 만.
 * DO NOT hub 만 `overflow-y-auto` — pane 이 스크롤러가 되면 list ch===sh → BottomNav hide 실패(가로 CDP).
 */
const LIST_PANE_SPLIT_CLASS = `${MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS} flex min-h-0 flex-col border-sam-border shrink-0 overflow-hidden`;
const LIST_PANE_HUB_CLASS = `${MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS} flex min-h-0 w-full flex-1 flex-col overflow-hidden`;

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

  const rightPaneClass = isSplitRoom
    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    : `hidden min-h-0 min-w-0 flex-1 ${SPLIT_MIN_TW}:flex ${SPLIT_MIN_TW}:flex-col overflow-hidden`;

  return (
    <div className={`flex min-h-0 w-full flex-row ${SHELL_HEIGHT_CLASS}`} data-messenger-master-detail={splitMode}>
      <div className={listPaneClass}>{list}</div>
      <div className={`${rightPaneClass} min-w-0`}>
        {showDetail && detail ? detail : <CommunityMessengerHomeDetailEmpty />}
      </div>
    </div>
  );
}
