"use client";

import type { ReactNode } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NotificationInboxCategoryIcon } from "@/components/notifications/NotificationInboxCategoryIcon";
import { resolveBellUnreadSequenceLabel } from "@/lib/notifications/bell-unread-sequence-label";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { resolveInboxOrderMetaLine } from "@/lib/notifications/inbox-order-status-label";
import { resolveNotificationInboxVisual } from "@/lib/notifications/notification-inbox-visual";

type Props = {
  items: InboxGroupItem[];
  onActivate: (item: InboxGroupItem) => void;
  onItemWarm?: (item: InboxGroupItem) => void;
  renderActions?: (item: InboxGroupItem) => ReactNode;
  onDelete?: (item: InboxGroupItem) => void | Promise<void>;
  deleteBusyKey?: string | null;
  compact?: boolean;
  /**
   * Bell unread quick inbox — sequence + category + title + summary + time.
   */
  summaryOnly?: boolean;
  /**
   * When `summaryOnly`, show Bell unread presentation numbers N…1 (not DB id).
   */
  showSequenceIndex?: boolean;
  emptyLabel: string;
  selectionMode?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (item: InboxGroupItem) => void;
  focusedNotificationId?: string | null;
};

function formatRowClock(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(language === "ko" ? "ko-KR" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * DIBAY notification cards — Bell modal + Full Inbox shared row chrome.
 * Unread: soft primary tint. Modal keeps descending sequence labels.
 */
export function InboxGroupCardList({
  items,
  onActivate,
  onItemWarm,
  renderActions,
  onDelete,
  deleteBusyKey,
  summaryOnly = false,
  showSequenceIndex = false,
  emptyLabel,
  selectionMode = false,
  selectedKeys,
  onToggleSelect,
  focusedNotificationId,
}: Props) {
  const { t, language } = useI18n();
  if (items.length === 0) {
    return <p className="px-1 py-6 text-center text-[13px] leading-snug text-sam-muted">{emptyLabel}</p>;
  }
  const hideDelete = summaryOnly || !onDelete || selectionMode;

  return (
    <ul className={`min-w-0 ${summaryOnly ? "space-y-1.5" : "space-y-2"}`}>
      {items.map((item, index) => {
        const kind = item.kindLabel;
        const hasUnread = item.unreadCount > 0;
        const isOrderGroup = item.isOrderGroup;
        const visual = resolveNotificationInboxVisual(item);
        const orderMetaLine =
          !summaryOnly && isOrderGroup ? resolveInboxOrderMetaLine(item.meta) : null;
        const snippet =
          item.body && item.body !== item.displayTitle
            ? item.body
            : summaryOnly
              ? null
              : item.body && !(isOrderGroup && item.body === item.displayTitle)
                ? item.body
                : null;
        const deleting = deleteBusyKey === item.key;
        const selected = selectionMode && (selectedKeys?.has(item.key) ?? false);
        const focused = Boolean(
          focusedNotificationId && item.ids.includes(focusedNotificationId)
        );
        const sequenceLabel =
          showSequenceIndex && summaryOnly
            ? resolveBellUnreadSequenceLabel(index, items.length) || null
            : null;
        const timeLabel = formatRowClock(item.created_at, language);
        const categoryLabel = item.surfaceBadge || kind || t("common_notifications");

        return (
          <li
            key={item.key}
            data-notification-focus-target={focused ? "1" : undefined}
          >
            <div
              className={`flex min-w-0 overflow-hidden rounded-2xl border transition ${
                hasUnread
                  ? "border-sam-primary/15 bg-sam-primary-soft/70"
                  : "border-sam-border/70 bg-sam-surface"
              } ${selected ? "ring-2 ring-sam-primary/35" : ""} ${
                focused ? "ring-2 ring-sam-primary/55" : ""
              } ${!hasUnread && !summaryOnly ? "opacity-95" : ""}`}
            >
              {selectionMode ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={t("notif_center_select_row_aria")}
                  disabled={deleting}
                  onClick={() => onToggleSelect?.(item)}
                  className="flex shrink-0 items-center justify-center px-2.5 py-3 disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-[4px] border-2 ${
                      selected
                        ? "border-sam-primary bg-sam-primary text-white"
                        : "border-sam-border bg-sam-surface"
                    }`}
                  >
                    {selected ? (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                        <path
                          d="M3.5 8.2 6.4 11l6.1-6.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                </button>
              ) : null}

              {sequenceLabel ? (
                <div
                  className="flex w-8 shrink-0 items-start justify-center pt-3.5 tabular-nums text-[11px] font-bold leading-none text-sam-primary"
                  aria-hidden
                >
                  {sequenceLabel}
                </div>
              ) : null}

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={deleting}
                  onTouchStart={() => onItemWarm?.(item)}
                  onPointerEnter={() => onItemWarm?.(item)}
                  onFocus={() => onItemWarm?.(item)}
                  onClick={() => {
                    if (selectionMode) {
                      onToggleSelect?.(item);
                      return;
                    }
                    onActivate(item);
                  }}
                  data-notification-row-action
                  className="flex w-full min-w-0 items-start gap-3 px-3 py-3 text-left transition active:bg-black/[0.03] disabled:opacity-60"
                >
                  <span
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${visual.wellClassName}`}
                    aria-hidden
                  >
                    <NotificationInboxCategoryIcon
                      kind={visual.kind}
                      className={`h-[18px] w-[18px] ${visual.iconClassName}`}
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-sam-meta">
                        {categoryLabel}
                        {kind && kind !== categoryLabel ? (
                          <span className="text-sam-meta"> · {kind}</span>
                        ) : null}
                      </span>
                      <span
                        className="shrink-0 text-[11px] leading-tight text-sam-meta tabular-nums"
                        suppressHydrationWarning
                      >
                        {timeLabel}
                      </span>
                    </span>

                    {orderMetaLine ? (
                      <span className="mt-0.5 block truncate text-[11px] font-medium leading-snug text-sam-meta">
                        {orderMetaLine}
                      </span>
                    ) : null}

                    <span
                      className={`mt-0.5 block break-words leading-snug text-sam-fg ${
                        summaryOnly
                          ? "line-clamp-1 text-[13px] font-semibold"
                          : "line-clamp-2 text-[14px] font-semibold"
                      }`}
                    >
                      {item.displayTitle}
                    </span>

                    {snippet ? (
                      <span className="mt-0.5 block line-clamp-1 break-words text-[12px] leading-snug text-sam-muted">
                        {snippet}
                      </span>
                    ) : null}
                  </span>

                  {!selectionMode ? (
                    <ChevronRight
                      className="mt-1 h-4 w-4 shrink-0 text-sam-meta"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : null}
                </button>

                {renderActions && !selectionMode && !summaryOnly ? (
                  <div className="px-3 pb-3">{renderActions(item)}</div>
                ) : null}
              </div>

              {!hideDelete ? (
                <div className="flex shrink-0 flex-col items-center justify-start py-2 pr-2">
                  <button
                    type="button"
                    disabled={deleting}
                    aria-label={t("notif_inbox_delete_aria")}
                    title={t("notif_inbox_delete_aria")}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void onDelete?.(item);
                    }}
                    className="touch-manipulation flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sam-muted transition hover:bg-sam-surface-muted hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
