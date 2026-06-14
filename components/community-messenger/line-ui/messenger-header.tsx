import type { ReactNode } from "react";
import { ChatHeader } from "@/components/chat/ChatHeader";

/** 커뮤니티 메신저·거래 채팅 공통 상단 바 높이 — 56px 고정. 아이콘 크기는 자식 책임. */
export const MESSENGER_CHAT_HEADER_SECTOR_HEIGHT_CLASS =
  "box-border h-14 min-h-14 max-h-14 shrink-0";

/** 56px 섹터 안 행 — 뒤로가기·프로필·액션 아이콘 세로 중앙(`items-center`)만 담당. */
export const MESSENGER_CHAT_HEADER_ROW_CLASS = "flex w-full min-h-0 items-center";

type Props = {
  children: ReactNode;
  className?: string;
};

/** 채팅방 상단 헤더 — ChatHeader 위임(sticky 제거, safe-area는 셸 padding). */
export function MessengerHeader({ children, className = "" }: Props) {
  return <ChatHeader className={className}>{children}</ChatHeader>;
}
