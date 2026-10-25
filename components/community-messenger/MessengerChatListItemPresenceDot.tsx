"use client";

import { memo } from "react";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";
import { useCmDevRenderTrace } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";

type Props = {
  peerUserId: string;
  /** §15: 오른쪽 아래에 친구 관계 배지가 있으면 점은 오른쪽 위로 */
  topRight?: boolean;
};

/**
 * 채팅 목록 1:1 direct 행 — presence 구독을 row 본문과 분리해 dot 만 리렌더.
 */
export const MessengerChatListItemPresenceDot = memo(function MessengerChatListItemPresenceDot({
  peerUserId,
  topRight = false,
}: Props) {
  useCmDevRenderTrace("MessengerChatListItemPresenceDot");
  const peerPresence = useCommunityMessengerPeerPresence(peerUserId);
  if (!peerPresence) return null;
  return (
    <CommunityMessengerPresenceDot state={peerPresence.state} className={topRight ? "!bottom-auto top-0" : ""} />
  );
});
