import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * 입력 영역 그리드 래퍼 — 마크업만 통일 (`CommunityMessengerRoomPhase2Composer` 가 슬롯 채움).
 * 스타일 토큰은 전역 `design-tokens.css` · `samarket-components.css` 와 `[data-cm-room]` 규칙을 따른다.
 */
export function MessengerInputBar({ children, className = "" }: Props) {
  return (
    <div
      data-cm-messenger-input-bar
      className={`grid min-h-[44px] min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem_2rem] items-stretch gap-1 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
