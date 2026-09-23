import type { ReactNode } from "react";
import { MessengerPillarHierarchyMotionShell } from "@/components/community-messenger/MessengerPillarHierarchyMotionShell";

/**
 * 주문 채팅 허브 — PAGE_HIERARCHY motion owned by MessengerPillarHierarchyMotionShell.
 */
export default function DeliveryChatsLayout({ children }: { children: ReactNode }) {
  return (
    <MessengerPillarHierarchyMotionShell pillar="delivery">{children}</MessengerPillarHierarchyMotionShell>
  );
}
