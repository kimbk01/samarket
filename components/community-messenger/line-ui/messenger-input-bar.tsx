import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * 입력 영역 그리드 래퍼 — 마크업만 통일 (`CommunityMessengerRoomPhase2Composer` 가 슬롯 채움).
 * 스타일 토큰은 `community-messenger-line-skin.css` 와 함께 사용.
 */
export function MessengerInputBar({ children, className = "" }: Props) {
  return (
    <div
      data-cm-messenger-input-bar
      className={`grid min-h-[48px] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_2.75rem] items-center gap-2 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
