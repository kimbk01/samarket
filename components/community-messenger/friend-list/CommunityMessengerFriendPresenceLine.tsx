"use client";

import { memo } from "react";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";
import {
  formatMessengerLastSeenYyMmDdHhMm,
  formatMessengerPeerPresenceLine,
} from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";

type Props = {
  peerUserId: string;
  /**
   * 접속 정보(온라인·자리 비움·마지막 접속)가 없을 때 대신 보일 글 — 친구 행 @아이디 (채팅 시안 4판 「2. 친구 탭」:
   * 상태 글 → 마지막 접속 → @아이디). 없으면 지금처럼 기본 문구.
   */
  fallbackText?: string | null;
};

/**
 * 친구 목록 행 — avatar PresenceDot + 2행 lastSeen/온라인 문구.
 * presence authority·formatter 는 기존 SSOT 재사용 (임의 lastSeen 계산 금지).
 */
export const CommunityMessengerFriendPresenceLine = memo(function CommunityMessengerFriendPresenceLine({
  peerUserId,
  fallbackText = null,
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
  const hasPresence =
    snapshot != null &&
    (snapshot.state === "online" ||
      snapshot.state === "away" ||
      Boolean(snapshot.lastSeenAt && formatMessengerLastSeenYyMmDdHhMm(snapshot.lastSeenAt)));
  return (
    <p data-cm-list-preview="" className="truncate" style={{ color: "var(--cm-chat-sub)" }}>
      {hasPresence || !fallbackText ? formatMessengerPeerPresenceLine(snapshot) : fallbackText}
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
