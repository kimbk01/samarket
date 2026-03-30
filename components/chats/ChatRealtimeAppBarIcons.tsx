"use client";

import type { ChatRoomRealtimeConnectionState } from "@/lib/chats/use-chat-room-realtime";

type Props = {
  state: ChatRoomRealtimeConnectionState;
  messagesLoading: boolean;
  variant?: "default" | "instagram";
  messageSoundMuted: boolean;
  onToggleMessageSound: () => void;
};

function BellOnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function BellOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />
    </svg>
  );
}

/** 실시간 상태 점 + 알림음 토글 — 이모지 대신 SVG(폰트와 무관) */
export function ChatRealtimeAppBarIcons({
  state,
  messagesLoading,
  variant = "default",
  messageSoundMuted,
  onToggleMessageSound,
}: Props) {
  const ig = variant === "instagram";

  const dotClass =
    messagesLoading || state === "disabled"
      ? "bg-gray-400"
      : state === "live"
        ? "bg-emerald-500"
        : state === "connecting" || state === "reconnecting"
          ? "animate-pulse bg-amber-500"
          : "bg-gray-400";

  const dotLabel =
    messagesLoading || state === "disabled"
      ? "채팅 연결 상태 확인 중"
      : state === "live"
        ? "실시간 연결됨"
        : state === "connecting"
          ? "실시간 연결 중"
          : state === "reconnecting"
            ? "실시간 재연결 중"
            : "실시간 미연결";

  const iconClass = ig ? "h-[22px] w-[22px]" : "h-5 w-5";

  return (
    <div className="flex shrink-0 items-center gap-1 pr-0.5">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
        role="img"
        aria-label={dotLabel}
        title={dotLabel}
      />
      <button
        type="button"
        onClick={onToggleMessageSound}
        className={
          ig
            ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-black/[0.05] active:bg-black/[0.08]"
            : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-800 hover:bg-black/10 active:bg-black/15"
        }
        aria-label={messageSoundMuted ? "이 채팅방 메시지 알림음 켜기" : "이 채팅방 메시지 알림음 끄기"}
        aria-pressed={messageSoundMuted}
      >
        {messageSoundMuted ? <BellOffIcon className={iconClass} /> : <BellOnIcon className={iconClass} />}
      </button>
    </div>
  );
}
