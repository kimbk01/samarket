"use client";

import type { CommunityMessengerHomeRealtimeParticipantUnreadHint } from "@/lib/community-messenger/realtime/community-messenger-realtime-types";

/** participant unread delta — 프레임당 1회 flush */
export function createCmParticipantUnreadRafBatcher(
  onBatch: (hints: CommunityMessengerHomeRealtimeParticipantUnreadHint[]) => void
): (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void {
  const queue: CommunityMessengerHomeRealtimeParticipantUnreadHint[] = [];
  let rafId: number | null = null;

  const flush = () => {
    rafId = null;
    const batch = queue.splice(0);
    if (batch.length === 0) return;
    onBatch(batch);
  };

  return (hint) => {
    queue.push(hint);
    if (rafId != null) return;
    rafId = requestAnimationFrame(flush);
  };
}
