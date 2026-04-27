"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import { isMessengerFromHeaderStackSurface } from "@/lib/layout/messenger-from-header-stack-surface";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";

/**
 * 필라이프·거래 홈·마켓 1단: **푸시 스택**으로 `section=chats` 메신저(하단 탭 **전체 경로**와 별개 UX).
 * 그 외 경로: 하단 메신저와 **동일 href**로 이동.
 *
 * 거래·필라이프 글쓰기 시트 초안이 있으면, 메신저(스택·링크) 진입 전 **저장되지 않음** 확인 후 시트를 닫는다.
 */
export function PhilifeHeaderMessengerButton() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const stack = usePhilifeHeaderMessengerStack();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const href = useMemo(
    () => BOTTOM_NAV_ITEMS.find((i) => i.id === "chat")?.href ?? "/community-messenger?section=chats",
    []
  );
  const label = t("nav_bottom_messenger");
  const useStack = isMessengerFromHeaderStackSurface(pathname);
  const ownerHub = useOwnerHubBadgeBreakdown();
  const unread = Math.max(0, Number(ownerHub.communityMessengerUnread) || 0);

  const openMessengerStack = useCallback(() => {
    if (!guardBeforeNavigate()) return;
    stack.open();
  }, [stack, guardBeforeNavigate]);

  if (useStack) {
    return (
      <div className="flex w-10 shrink-0 items-center justify-end">
        <button
          type="button"
          onClick={openMessengerStack}
          className="sam-header-action relative h-10 w-10 text-sam-fg"
          aria-label={label}
        >
          <BottomNavMessengerChatIcon className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sam-primary px-0.5 text-[9px] font-bold leading-none text-sam-on-primary">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-10 shrink-0 items-center justify-end">
      <Link
        href={href}
        className="sam-header-action relative h-10 w-10 text-sam-fg"
        aria-label={label}
        prefetch
        onClick={(e) => {
          if (!guardBeforeNavigate()) e.preventDefault();
        }}
      >
        <BottomNavMessengerChatIcon className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sam-primary px-0.5 text-[9px] font-bold leading-none text-sam-on-primary">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

/** `BottomNav` `TAB_ICONS.chat` 과 동일(말풍선) */
function BottomNavMessengerChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}
