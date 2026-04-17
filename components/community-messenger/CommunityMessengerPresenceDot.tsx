"use client";

import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";

type Props = {
  state: CommunityMessengerPresenceState | null | undefined;
  className?: string;
  title?: string;
};

/**
 * 채팅 목록·헤더·친구 행 공통 — 읽음/통화 상태와 분리된 presence 전용 점.
 * ONLINE 녹 / AWAY 노랑 / OFFLINE 회색
 */
export function CommunityMessengerPresenceDot({ state, className = "", title }: Props) {
  if (!state) return null;
  const color =
    state === "online" ? "bg-emerald-500" : state === "away" ? "bg-amber-400" : "bg-slate-300";
  return (
    <span
      className={`pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white ${color} ${className}`.trim()}
      title={title}
      aria-hidden
    />
  );
}
