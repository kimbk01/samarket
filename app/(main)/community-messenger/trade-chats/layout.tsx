import type { ReactNode } from "react";

/**
 * 거래 채팅 허브 — layout 이 우→좌 369ms surface (loading/page 공통).
 * gate·list 는 내부만 교체하고 slide 를 재실행하지 않는다.
 */
export default function TradeChatsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="sam-messenger-pillar-list-enter flex h-full min-h-0 flex-col"
      data-domain-pillar-segment="trade"
      data-messenger-pillar-enter="1"
      data-messenger-pillar-enter-ms="369"
    >
      {children}
    </div>
  );
}
