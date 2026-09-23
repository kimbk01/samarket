import type { ReactNode } from "react";
import { MessengerPillarHierarchyMotionShell } from "@/components/community-messenger/MessengerPillarHierarchyMotionShell";

/**
 * 거래 채팅 허브 — PAGE_HIERARCHY motion owned by MessengerPillarHierarchyMotionShell.
 * AppRouteTransition suppressed for hub↔pillar (shouldSuppressMessengerPageMotionMainShellSlide).
 */
export default function TradeChatsLayout({ children }: { children: ReactNode }) {
  return <MessengerPillarHierarchyMotionShell pillar="trade">{children}</MessengerPillarHierarchyMotionShell>;
}
