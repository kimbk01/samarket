"use client";

import { memo } from "react";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";
import { formatMessengerPeerPresenceLine } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";

type Props = {
  peerUserId: string;
};

/**
 * 친구 목록 행 — avatar PresenceDot + 2행 lastSeen/온라인 문구.
 * presence authority·formatter 는 기존 SSOT 재사용 (임의 lastSeen 계산 금지).
 */
export const CommunityMessengerFriendPresenceLine = memo(function CommunityMessengerFriendPresenceLine({
  peerUserId,
}: Props) {
  const peerPresence = useCommunityMessengerPeerPresence(peerUserId);
  const storeLastSeenAt = useMessengerPresenceStore((s) =>
    peerUserId ? s.byUserId[peerUserId]?.lastSeenAt ?? null : null
  );
  const snapshot =
    peerPresence == null
      ? null
      : {
          ...peerPresence,
          lastSeenAt: peerPresence.lastSeenAt ?? storeLastSeenAt,
        };
  return (
    <p data-cm-list-preview="" className="truncate text-sam-fg-muted">
      {formatMessengerPeerPresenceLine(snapshot)}
    </p>
  );
});

type DotProps = {
  peerUserId: string;
};

/** 친구 행 아바타 우하단 — online/away 녹·노랑점 */
export const CommunityMessengerFriendPresenceDot = memo(function CommunityMessengerFriendPresenceDot({
  peerUserId,
}: DotProps) {
  const peerPresence = useCommunityMessengerPeerPresence(peerUserId);
  if (!peerPresence) return null;
  return <CommunityMessengerPresenceDot state={peerPresence.state} />;
});
