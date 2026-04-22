"use client";

import dynamic from "next/dynamic";

/** Phase2 전용 지연 로드 — 메인 방 모듈 초기 파싱·번들에서 무거운 서브트리 분리 */
export const GroupRoomCallOverlay = dynamic(
  () =>
    import("@/components/community-messenger/call-ui/GroupRoomCallOverlay").then((m) => ({
      default: m.GroupRoomCallOverlay,
    })),
  { ssr: false, loading: () => null }
);

export const VoiceMessageBubble = dynamic(
  () =>
    import("@/components/community-messenger/VoiceMessageBubble").then((m) => ({
      default: m.VoiceMessageBubble,
    })),
  {
    ssr: false,
    loading: () => (
      <span
        className="inline-block h-10 min-w-[8rem] rounded-lg bg-[color:var(--cm-room-divider)]/35"
        aria-hidden
      />
    ),
  }
);

export const CommunityMessengerTradeProcessSection = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerTradeProcessSection").then((m) => ({
      default: m.CommunityMessengerTradeProcessSection,
    })),
  { ssr: false, loading: () => null }
);

/** 거래 카드·실시간과 경합 줄이기 — 청크 지연만으로 `fetch` 가 늦어지면 안 되므로 동적 import 하지 않음 */
export {
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
} from "@/components/community-messenger/room/messenger-room-trade-prefetch";

