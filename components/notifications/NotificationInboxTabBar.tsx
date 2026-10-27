"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { NotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";
import { DIBAY_STATUS_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

export type NotificationInboxTabKey =
  | "all"
  | "unread"
  | "read"
  | "notice"
  | "trade"
  | "community"
  | "delivery"
  | "marketing"
  | "system";

type Chip = { key: NotificationInboxTabKey; label: string };

type Props = {
  chips: readonly Chip[];
  active: NotificationInboxTabKey;
  counts: NotificationCenterTabUnreadCounts;
  onSelect: (key: NotificationInboxTabKey) => void;
  /** @deprecated geometry locked to SSOT — ignored */
  compact?: boolean;
  className?: string;
  /** INAPP-12 — tablist accessible name (default: i18n 「알림 분류」). */
  ariaLabel?: string;
};

/**
 * Notification Center page-nav — visual SSOT only. Badge equation unchanged.
 */
export function NotificationInboxTabBar({
  chips,
  active,
  counts,
  onSelect,
  compact: _compact = false,
  className = "",
  ariaLabel,
}: Props) {
  const { t } = useI18n();
  return (
    <div
      className={`${DIBAY_STATUS_TABS_CLASS} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel ?? t("notif_center_tabs_aria")}
      data-dibay-nav="status"
    >
      {chips.map(({ key, label }) => {
        const selected = active === key;
        const count = counts[key] ?? 0;
        // CONTRACT: unread digit on 전체 + category. Never badge 읽음.
        const showBadge = key !== "read" && count > 0;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={
              showBadge ? t("notif_center_tab_unread_aria", { label, n: count }) : undefined
            }
            onClick={() => {
              if (selected) return;
              onSelect(key);
            }}
            className={dibaySecondaryTabClass(selected)}
          >
            <span>{label}</span>
            {showBadge ? (
              <span
                aria-hidden
                className={`ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                  "bg-sam-danger text-sam-on-primary"
                }`}
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
