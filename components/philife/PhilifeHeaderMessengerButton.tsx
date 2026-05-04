"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import { isMessengerFromHeaderStackSurface } from "@/lib/layout/messenger-from-header-stack-surface";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  clientHasVerifiedContactForInteractive,
  openPhoneVerificationRequiredDialog,
} from "@/lib/auth/phone-verification-gate-client";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { resolveMessengerTabTotalUnreadBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import {
  inferMessengerEntryOriginFromPath,
  withMessengerEntryOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";

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
  const baseMessengerHref = useMemo(
    () => BOTTOM_NAV_ITEMS.find((i) => i.id === "chat")?.href ?? "/community-messenger?section=chats",
    []
  );
  /** 커뮤니티·거래·배달 상단 헤더에서 풀 경로로 갈 때 `?from=` — 뒤로가기가 해당 탭과 맞음 */
  const href = useMemo(
    () => withMessengerEntryOrigin(baseMessengerHref, inferMessengerEntryOriginFromPath(pathname)),
    [baseMessengerHref, pathname]
  );
  const label = t("nav_bottom_messenger");
  const useStack = isMessengerFromHeaderStackSurface(pathname);
  const ownerHub = useOwnerHubBadgeBreakdown();
  /** 거래 레거시 채팅(`chatUnread`) + 메신저(`communityMessengerUnread`) — 종 알림과 분리(notif-0002) */
  const unread = resolveMessengerTabTotalUnreadBadgeCount(ownerHub);

  const openMessengerStack = useCallback(() => {
    if (!guardBeforeNavigate()) return;
    const user = getCurrentUser();
    if (user?.id && !clientHasVerifiedContactForInteractive(user)) {
      openPhoneVerificationRequiredDialog({ next: baseMessengerHref });
      return;
    }
    stack.open();
  }, [stack, guardBeforeNavigate, baseMessengerHref]);

  if (useStack) {
    return (
      <div className="inline-flex shrink-0 items-center">
        <button
          type="button"
          onClick={openMessengerStack}
          className="sam-header-action relative h-10 w-10 shrink-0 text-sam-fg transition-[transform,background-color,opacity] duration-300 ease-out active:duration-100 active:scale-[0.88] active:bg-sam-surface-muted active:opacity-85"
          aria-label={label}
        >
          <BottomNavMessengerChatIcon className="h-6 w-6" />
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
    <div className="inline-flex shrink-0 items-center">
      <Link
        href={href}
        className="sam-header-action relative h-10 w-10 shrink-0 text-sam-fg transition-[transform,background-color,opacity] duration-300 ease-out active:duration-100 active:scale-[0.88] active:bg-sam-surface-muted active:opacity-85"
        aria-label={label}
        prefetch
        onClick={(e) => {
          if (!guardBeforeNavigate()) {
            e.preventDefault();
            return;
          }
          const user = getCurrentUser();
          if (user?.id && !clientHasVerifiedContactForInteractive(user)) {
            e.preventDefault();
            openPhoneVerificationRequiredDialog({ next: baseMessengerHref });
          }
        }}
      >
        <BottomNavMessengerChatIcon className="h-6 w-6" />
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
