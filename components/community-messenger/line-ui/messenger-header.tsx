import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** 채팅방 등 상단 고정 헤더 — 얇은 보더, 그림자 없음. */
export function MessengerHeader({ children, className = "" }: Props) {
  return (
    <header
      data-cm-messenger-line-header
      className={`sticky top-0 z-10 shrink-0 border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-1.5 ${className}`.trim()}
    >
      {children}
    </header>
  );
}
