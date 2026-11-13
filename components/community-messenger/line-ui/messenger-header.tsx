import type { ReactNode } from "react";
import { ChatHeader } from "@/components/chat/ChatHeader";

type Props = {
  children: ReactNode;
  className?: string;
};

/** 채팅방 상단 헤더 — ChatHeader 위임(sticky 제거, safe-area는 셸 padding). */
export function MessengerHeader({ children, className = "" }: Props) {
  return <ChatHeader className={className}>{children}</ChatHeader>;
}
