"use client";

import type { ReactNode } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NotificationInboxCategoryIcon } from "@/components/notifications/NotificationInboxCategoryIcon";
import { resolveBellUnreadSequenceLabel } from "@/lib/notifications/bell-unread-sequence-label";
import { formatNotificationInboxTime } from "@/lib/notifications/format-notification-inbox-time";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { resolveInboxOrderMetaLine } from "@/lib/notifications/inbox-order-status-label";
import { resolveMemberNotificationRowLabelKey } from "@/lib/notifications/member-notification-domain";
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

/**
 * DIBAY notification rows — Bell modal + Full Inbox shared chrome (mockup).
 * Flat divider list, soft domain chips, circular icons. Bell keeps N…1 sequence.
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
    <ul className="min-w-0 divide-y divide-sam-border/55">
      {items.map((item, index) => {
        const kind = item.kindLabel;
        const isOrderGroup = item.isOrderGroup;
        const visual = resolveNotificationInboxVisual(item);
        const orderMetaLine =
          !summaryOnly && isOrderGroup ? resolveInboxOrderMetaLine(item.meta) : null;
        const snippet =
          item.body && item.body !== item.displayTitle && !(isOrderGroup && item.body === item.displayTitle)
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
        const timeLabel = formatNotificationInboxTime(item.created_at, language);
        const labelKey = resolveMemberNotificationRowLabelKey({
          push_kind: item.push_kind,
          notification_type: item.notification_type,
          event_type: item.event_type,
          bell_presentation_type: item.bell_presentation_type,
          campaign_type: item.campaign_type,
          meta_kind: typeof item.meta?.kind === "string" ? item.meta.kind : null,
        });
        const categoryLabel = labelKey
          ? t(labelKey)
          : item.surfaceBadge || kind || t("common_notifications");

        return (
          <li
            key={item.key}
            data-notification-focus-target={focused ? "1" : undefined}
            className={`${focused ? "bg-sam-primary-soft/40" : "bg-sam-surface"} ${
              selected ? "bg-sam-primary-soft/55" : ""
            }`}
          >
            <div className="flex min-w-0 items-stretch">
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
                  className="flex w-7 shrink-0 items-start justify-center pt-[18px] tabular-nums text-[12px] font-semibold leading-none text-sam-fg/80"
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
                  className="flex w-full min-w-0 items-start gap-2.5 px-2 py-3.5 text-left transition active:bg-black/[0.02] disabled:opacity-60"
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
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span
                        className={`inline-flex max-w-[70%] truncate rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-tight ${visual.chipClassName}`}
                      >
                        {categoryLabel}
                      </span>
                      <span
                        className="shrink-0 text-[11px] leading-tight text-sam-meta tabular-nums"
                        suppressHydrationWarning
                      >
                        {timeLabel}
                      </span>
                    </span>

                    {orderMetaLine ? (
                      <span className="mt-1 block truncate text-[11px] font-medium leading-snug text-sam-meta">
                        {orderMetaLine}
                      </span>
                    ) : null}

                    <span className="mt-1 block break-words text-[14px] font-bold leading-snug text-sam-fg line-clamp-1">
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
                      className="mt-2 h-4 w-4 shrink-0 text-sam-meta/80"
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
                <div className="flex shrink-0 flex-col items-center justify-start py-2 pr-1.5">
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
