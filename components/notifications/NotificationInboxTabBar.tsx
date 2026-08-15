"use client";

import type { NotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";

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
  /** denser chips for bell modal */
  compact?: boolean;
  className?: string;
};

/**
 * Shared horizontal tab strip for Notification Center (mockup 7-domain IA).
 * Member A only — Owner store is not mixed into this bar.
 */
export function NotificationInboxTabBar({
  chips,
  active,
  counts,
  onSelect,
  compact = false,
  className = "",
}: Props) {
  const pad = compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-[7px] text-[12px]";

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${className}`}
      role="tablist"
      aria-label="notification tabs"
    >
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              onClick={() => onSelect(key)}
              className={`inline-flex shrink-0 items-center rounded-full font-semibold transition-transform active:scale-[0.97] ${pad} ${
                selected
                  ? "bg-sam-primary text-white shadow-sm"
                  : "bg-[#EFE8DF] text-sam-fg hover:bg-[#E8E0D6] active:bg-[#E2D9CE]"
              }`}
            >
              <span>{label}</span>
              {showBadge ? (
                <span
                  className={`ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                    selected ? "bg-sam-danger text-white" : "bg-sam-danger text-white"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
