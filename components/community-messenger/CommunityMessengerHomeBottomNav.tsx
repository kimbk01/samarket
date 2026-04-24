"use client";

import type { ReactNode } from "react";
import { Users } from "lucide-react";
import {
  type MessengerMainSection,
  messengerSectionLabel,
} from "@/lib/community-messenger/messenger-ia";
import { useMessengerHomeBottomNavScrollHide } from "@/lib/community-messenger/home/use-messenger-home-bottom-nav-scroll-hide";

const ORDER: readonly MessengerMainSection[] = ["friends", "chats", "open_chat", "archive"] as const;

/** 캡슐 탭용 단색 스트로크 아이콘 — 터치·가독을 위해 24px 상당 */
const ICON = "h-6 w-6 shrink-0";

type Props = {
  value: MessengerMainSection;
  onSelect: (next: MessengerMainSection) => void;
  /** false면 스크롤해도 캡슐을 숨기지 않음 */
  enableScrollAutohide?: boolean;
};

function PersonGlyph() {
  return (
    <svg className={ICON} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function ChatGlyph() {
  return (
    <svg className={ICON} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
/**
 * 모임 — Lucide `Users`(앞 1명 + 뒤 2명 실루엣) = 일반 UI에서 쓰는 “사람 여럿/👥” 류
 */
function OpenChatGroupGlyph() {
  return <Users className={ICON} strokeWidth={1.9} aria-hidden focusable="false" />;
}
function ArchiveGlyph() {
  return (
    <svg className={ICON} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

const GLYPHS: Record<MessengerMainSection, () => ReactNode> = {
  friends: () => <PersonGlyph />,
  chats: () => <ChatGlyph />,
  open_chat: () => <OpenChatGroupGlyph />,
  archive: () => <ArchiveGlyph />,
};

/**
 * `/community-messenger` 허브 — 앱 `BottomNav` 대신 캡슐 4탭(친구·채팅·모임·보관함).
 * 스크롤 시 아래로 내려갔다가(숨김) 유휴 시 복귀.
 */
export function CommunityMessengerHomeBottomNav({
  value,
  onSelect,
  enableScrollAutohide = true,
}: Props) {
  const hidden = useMessengerHomeBottomNavScrollHide(enableScrollAutohide);

  return (
    <nav
      className={`pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-0 transition-transform duration-300 ease-out will-change-transform ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      aria-label="메신저"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-stretch justify-between gap-0.5 rounded-full border border-white/25 bg-[color:var(--messenger-primary)] px-2 py-1.5 text-white shadow-lg shadow-black/25">
        {ORDER.map((id) => {
          const active = value === id;
          const G = GLYPHS[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={
                active
                  ? "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full bg-white/25 py-1 text-[11px] font-semibold leading-tight"
                  : "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1 text-[11px] font-medium leading-tight text-white/90 transition hover:opacity-100 active:scale-[0.97]"
              }
            >
              {G()}
              <span className="max-w-full truncate">{messengerSectionLabel(id)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
