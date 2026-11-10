"use client";

import { Plus } from "lucide-react";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";

/**
 * 메신저 홈 탭 주 버튼 (Owner 2026-11-10 채팅 화면 시안 3판) — 아이콘만 쓰지 않고 할 일을 글자로 적는다.
 * 목록 영역(부모 `relative`) 오른쪽 아래, 하단 탭이 있으면 그 위.
 * 채팅 시안 4판: 높이 48 · 알약 · 여백 0 20 0 16 · 15px 굵게 · + 20px · 오른쪽 16 · 그림자 `--cm-chat-fab-shadow`.
 */
export function MessengerHomePrimaryActionButton({
  label,
  onClick,
  dataAttr,
}: {
  label: string;
  onClick: () => void;
  dataAttr: string;
}) {
  const bottomNavOccupiesClearance = useBottomNavOccupiesClearance();
  return (
    <button
      type="button"
      onClick={onClick}
      data-cm-primary-action={dataAttr}
      className={`absolute right-4 z-30 inline-flex h-12 items-center gap-1.5 rounded-full bg-sam-primary pl-4 pr-5 text-[15px] font-bold text-white shadow-[var(--cm-chat-fab-shadow)] transition active:scale-[0.97] ${
        bottomNavOccupiesClearance ? MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS : "bottom-4"
      }`}
    >
      <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
      {label}
    </button>
  );
}
