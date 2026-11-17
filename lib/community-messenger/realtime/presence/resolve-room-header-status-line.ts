import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import {
  formatMessengerPeerPresenceLine,
  type MessengerPresenceLineT,
} from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";

/** 머리글 상태 줄 판정 결과 — 입력 중이면 `TypingIndicatorLine`(점 애니메이션), 아니면 글자 */
export type MessengerRoomHeaderStatus = { kind: "typing"; label: string } | { kind: "text"; text: string };

/**
 * 방 머리글 부제(상태 줄) — 머리글 5개 표시 경로(그룹·1:1·일반·거래 매물·배달)가 모두 이 결과를 쓴다 (P3).
 * - 입력 중(`typingLabel`, `resolveMessengerTypingLabel` 결과)이 있으면 항상 입력 중.
 * - 그룹: 그 외 방 상태 문구.
 * - 1:1: 접속 상태(「온라인」·「마지막 접속 …」·「오프라인」 — P3 레거시 기준 「자리 비움」 없음).
 *   상대가 있는데 접속 상태가 아직 없으면(첫 조회 응답 전) **빈칸** — 방 설명 문구를 상태 자리에 쓰지 않는다
 *   (2026-11-16 감사 F3: 「1:1 대화 · 친구와 1:1로 대화하는 채팅방」이 상태처럼 나옴).
 *   상대 id 를 모르는 방만 지금처럼 방 상태 문구.
 * @see docs/audit/messenger-direct-header-presence-audit-plan-2026-11-16.md
 */
export function resolveMessengerRoomHeaderStatusLine(args: {
  roomType: string;
  typingLabel: string | null;
  peerUserId: string | null | undefined;
  peerPresence: CommunityMessengerPeerPresenceSnapshot | null;
  roomHeaderStatus: string;
  t: MessengerPresenceLineT;
}): MessengerRoomHeaderStatus {
  if (args.typingLabel) return { kind: "typing", label: args.typingLabel };
  if (args.roomType !== "direct") return { kind: "text", text: args.roomHeaderStatus };
  if (args.peerPresence) return { kind: "text", text: formatMessengerPeerPresenceLine(args.peerPresence, args.t) };
  if (args.peerUserId?.trim()) return { kind: "text", text: "" };
  return { kind: "text", text: args.roomHeaderStatus };
}
