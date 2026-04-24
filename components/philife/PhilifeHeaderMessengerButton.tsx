"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

/**
 * `/philife` 1단: **푸시 스택**으로 `section=chats` 메신저(하단 탭 **전체 경로**와 별개 UX).
 * 그 외 경로: 하단 메신저와 **동일 href**로 이동.
 */
export function PhilifeHeaderMessengerButton() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const onPhilife = pathname.split("?")[0] === "/philife";
  const stack = usePhilifeHeaderMessengerStack();
  const href = useMemo(
    () => BOTTOM_NAV_ITEMS.find((i) => i.id === "chat")?.href ?? "/community-messenger?section=chats",
    []
  );
  const label = t("nav_bottom_messenger");

  if (onPhilife) {
    return (
      <div className="flex w-10 shrink-0 items-center justify-end">
        <button
          type="button"
          onClick={() => stack.open()}
          className="sam-header-action h-10 w-10 text-sam-fg"
          aria-label={label}
        >
          <BottomNavMessengerChatIcon className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-10 shrink-0 items-center justify-end">
      <Link href={href} className="sam-header-action h-10 w-10 text-sam-fg" aria-label={label} prefetch>
        <BottomNavMessengerChatIcon className="h-5 w-5" />
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
