"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 알림 최종 설계 §2-1 (Owner 승인 2026-11-01) — 종이 비었을 때: 지난 소식은 각 목적지 목록에서 본다.
 * 종 안에는 기록 목록을 두지 않는다.
 */
export const NOTIFICATION_BELL_EMPTY_SHORTCUTS: readonly { href: string; labelKey: MessageKey }[] = [
  { href: "/mypage/customer-center/notice", labelKey: "notif_bell_shortcut_notice" },
  { href: "/mypage/app-updates", labelKey: "notif_bell_shortcut_update" },
  { href: "/orders", labelKey: "notif_bell_shortcut_orders" },
  { href: "/mypage/products", labelKey: "notif_bell_shortcut_trade" },
  { href: "/mypage/reports", labelKey: "notif_bell_shortcut_reports" },
  { href: "/mypage/support-history", labelKey: "notif_bell_shortcut_support" },
];

export function NotificationBellEmptyShortcuts({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-8 flex flex-col items-center px-4 py-10 text-center" data-notification-bell-empty>
      <span
        className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sam-primary-soft text-sam-primary"
        aria-hidden
      >
        <Bell className="h-7 w-7" strokeWidth={2} />
      </span>
      <p className="text-[16px] font-semibold text-sam-fg">{t("notif_bell_empty_title")}</p>
      <p className="mt-1 text-[13px] leading-snug text-sam-muted">{t("notif_bell_empty_body")}</p>
      <div className="mt-5 grid w-full max-w-[20rem] grid-cols-2 gap-2">
        {NOTIFICATION_BELL_EMPTY_SHORTCUTS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            onClick={onNavigate}
            className="flex min-h-11 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] font-semibold text-sam-primary transition active:bg-sam-pressed-surface"
          >
            {t(s.labelKey)}
          </Link>
        ))}
      </div>
    </div>
  );
}
