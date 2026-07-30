import type { ReactNode } from "react";

/**
 * 주문 채팅 허브 — layout 이 우→좌 369ms surface (loading/page 공통).
 */
export default function DeliveryChatsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="sam-messenger-pillar-list-enter flex h-full min-h-0 flex-col"
      data-domain-pillar-segment="delivery"
      data-messenger-pillar-enter="1"
      data-messenger-pillar-enter-ms="369"
    >
      {children}
    </div>
  );
}
