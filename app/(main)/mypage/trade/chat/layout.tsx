import type { ReactNode } from "react";

/** 채팅방 상세는 `ConditionalAppShell`이 뷰포트를 고정할 때 플렉스 체인용. 목록은 문서 스크롤을 쓴다. */
export default function TradeChatBranchLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>;
}
