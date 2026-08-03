"use client";

import type { NotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";

export type NotificationInboxTabKey =
  | "all"
  | "trade"
  | "delivery"
  | "system"
  | "marketing"
  | "store";

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
 * Shared horizontal tab strip for Bell modal + Notification Center.
 * Member tabs scroll; store stays pinned right when present.
 */
export function NotificationInboxTabBar({
  chips,
  active,
  counts,
  onSelect,
  compact = false,
  className = "",
}: Props) {
  const memberChips = chips.filter((c) => c.key !== "store");
  const storeChip = chips.find((c) => c.key === "store") ?? null;
  const pad = compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-1.5 text-[12px]";

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${className}`}
      role="tablist"
      aria-label="notification tabs"
    >
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {memberChips.map(({ key, label }) => {
          const selected = active === key;
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(key)}
              className={`inline-flex shrink-0 items-center rounded-full font-medium transition-transform active:scale-[0.97] ${pad} ${
                selected
                  ? "bg-signature text-white"
                  : "bg-sam-surface-muted text-sam-fg hover:bg-sam-muted/20 active:bg-sam-muted/25"
              }`}
            >
              <span>{label}</span>
              {count > 0 ? (
                <span
                  className={`ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                    selected ? "bg-white text-sam-danger" : "bg-sam-danger text-white"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {storeChip ? (
        <button
          type="button"
          role="tab"
          aria-selected={active === "store"}
          onClick={() => onSelect("store")}
          className={`inline-flex shrink-0 items-center rounded-full font-semibold transition-transform active:scale-[0.97] ${pad} ${
            active === "store"
              ? "bg-sam-danger text-white"
              : "border border-sam-danger/30 bg-sam-danger/10 text-sam-danger"
          }`}
        >
          <span>{storeChip.label}</span>
          {counts.store > 0 ? (
            <span
              className={`ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                active === "store" ? "bg-white text-sam-danger" : "bg-sam-danger text-white"
              }`}
            >
              {counts.store > 99 ? "99+" : counts.store}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
