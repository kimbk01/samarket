"use client";

import { memo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** 56px(태블릿 60px) 고정 헤더 — safe-area-top은 [data-cm-room].chat-viewport-shell padding이 담당 */
export const ChatHeader = memo(function ChatHeader({ children, className = "" }: Props) {
  return (
    <header
      data-chat-header
      data-cm-messenger-line-header
      className={`chat-header ${className}`.trim()}
    >
      <div className="chat-header__row">{children}</div>
    </header>
  );
});
