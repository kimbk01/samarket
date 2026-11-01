"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NotificationInboxCategoryIcon } from "@/components/notifications/NotificationInboxCategoryIcon";
import { formatNotificationInboxTime } from "@/lib/notifications/format-notification-inbox-time";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { resolveInboxOrderMetaLine } from "@/lib/notifications/inbox-order-status-label";
import {
  memberNotificationDomainRowFromInbox,
  resolveMemberNotificationRowLabelKey,
} from "@/lib/notifications/member-notification-domain";
import { resolveNotificationInboxVisual } from "@/lib/notifications/notification-inbox-visual";
import { resolveInboxRowReadState } from "@/lib/notifications/inbox-row-read-state";
import { resolveNotificationDestinationHintKey } from "@/lib/notifications/notification-destination-hint-key";

type Props = {
  items: InboxGroupItem[];
  onActivate: (item: InboxGroupItem) => void;
  onItemWarm?: (item: InboxGroupItem) => void;
  renderActions?: (item: InboxGroupItem) => ReactNode;
  onDelete?: (item: InboxGroupItem) => void | Promise<void>;
  deleteBusyKey?: string | null;
  compact?: boolean;
  /**
   * Bell quick inbox — category + title + summary + time (no actions).
   * C4: 화면 순번(N…1)은 폐지 — 종 숫자(미읽음 이벤트 수)와 단위가 달라 혼동을 줬다.
   */
  summaryOnly?: boolean;
  emptyLabel: string;
  selectionMode?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (item: InboxGroupItem) => void;
  focusedNotificationId?: string | null;
  /** 알림 최종 설계 §2-3 — 줄 아래 「○○에서 보기 ›」 + 이미지 썸네일 (회원 종) */
  showDestinationHint?: boolean;
  /** 알림 최종 설계 §2-4 — 줄을 왼쪽으로 밀면 「읽음」 (이동 없이 읽음 → 종에서 사라짐) */
  onSwipeRead?: (item: InboxGroupItem) => void;
};

/** 왼쪽으로 밀어 「읽음」 버튼을 여는 줄 감싸개. 탭(이동)과 겹치지 않게 일정 거리 이상 밀 때만 연다. */
function SwipeReadRow({
  enabled,
  label,
  onRead,
  children,
}: {
  enabled: boolean;
  label: string;
  onRead: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  if (!enabled) return <>{children}</>;
  return (
    <div
      className="relative overflow-hidden"
      onTouchStart={(e) => {
        startX.current = e.touches[0]?.clientX ?? null;
        startY.current = e.touches[0]?.clientY ?? 0;
      }}
      onTouchEnd={(e) => {
        const sx = startX.current;
        startX.current = null;
        if (sx == null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - sx;
        const dy = Math.abs(t.clientY - startY.current);
        if (dy > 30) return;
        if (dx < -48) setOpen(true);
        else if (dx > 32) setOpen(false);
      }}
      data-notification-swipe-row={open ? "open" : "closed"}
    >
      <div
        className="transition-transform duration-150"
        style={{ transform: open ? "translateX(-76px)" : "translateX(0)" }}
        onClickCapture={(e) => {
          if (open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {children}
      </div>
      <button
        type="button"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => {
          setOpen(false);
          onRead();
        }}
        className={`absolute inset-y-0 right-0 flex w-[76px] items-center justify-center bg-sam-primary text-[13px] font-semibold text-sam-on-primary transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        data-notification-swipe-read
      >
        {label}
      </button>
    </div>
  );
}

/**
 * DIBAY notification rows — Bell modal + Full Inbox shared chrome (mockup).
 * Flat divider list, soft domain chips, circular icons.
 * 묶음 줄은 실제 이벤트 수를 따로 표시한다(C4 — 줄 수 ≠ 미읽음 이벤트 수).
 */
export function InboxGroupCardList({
  items,
  onActivate,
  onItemWarm,
  renderActions,
  onDelete,
  deleteBusyKey,
  summaryOnly = false,
  emptyLabel,
  selectionMode = false,
  selectedKeys,
  onToggleSelect,
  focusedNotificationId,
  showDestinationHint = false,
  onSwipeRead,
}: Props) {
  const { t, language } = useI18n();
  if (items.length === 0) {
    return <p className="px-1 py-6 text-center text-[13px] leading-snug text-sam-muted">{emptyLabel}</p>;
  }
  const hideDelete = summaryOnly || !onDelete || selectionMode;

  return (
    <ul className="min-w-0 divide-y divide-sam-border/55">
      {items.map((item) => {
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
        // C4: 묶음 줄 = 이벤트 여러 건 → 미읽음이 있으면 미읽음 건수, 모두 읽었으면 전체 건수.
        const groupCountLabel =
          item.ids.length > 1
            ? item.unreadCount > 0
              ? t("notif_group_unread_count", { n: item.unreadCount })
              : t("notif_group_total_count", { n: item.ids.length })
            : null;
        const timeLabel = formatNotificationInboxTime(item.created_at, language);
        // INAPP-01 — unread rows: tint + dot + bold title; read rows plain.
        const readState = resolveInboxRowReadState(item.unreadCount);
        const labelKey = resolveMemberNotificationRowLabelKey(memberNotificationDomainRowFromInbox(item));
        const categoryLabel = labelKey
          ? t(labelKey)
          : item.surfaceBadge || kind || t("common_notifications");
        const destinationHintKey = showDestinationHint ? resolveNotificationDestinationHintKey(item.href) : null;
        const thumbUrl =
          showDestinationHint && typeof item.image_url === "string" && item.image_url.startsWith("https://")
            ? item.image_url
            : null;

        return (
          <li
            key={item.key}
            data-notification-focus-target={focused ? "1" : undefined}
            data-notification-unread={readState.unread ? "1" : "0"}
            className={
              // U-01 — 선택 = 흰 배경 + 2px 브랜드 테두리 (미읽음 연녹 배경과 구분)
              selected
                ? "relative bg-sam-surface ring-2 ring-inset ring-sam-primary"
                : focused
                  ? "relative bg-sam-primary-soft ring-1 ring-inset ring-sam-primary/40"
                  : readState.rowClassName
            }
          >
            <SwipeReadRow
              enabled={Boolean(onSwipeRead) && !selectionMode && item.unreadCount > 0}
              label={t("notif_bell_swipe_read")}
              onRead={() => onSwipeRead?.(item)}
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
                    className={`flex h-5 w-5 items-center justify-center rounded-ui-rect border-2 ${
                      selected
                        ? "border-sam-primary bg-sam-primary text-sam-on-primary"
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
                  className="flex w-full min-w-0 items-start gap-2.5 px-2 py-3.5 text-left transition active:bg-sam-pressed-surface disabled:opacity-60"
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
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`inline-flex min-w-0 max-w-full truncate rounded-ui-rect px-1.5 py-0.5 text-[11px] font-medium leading-tight ${visual.chipClassName}`}
                        >
                          {categoryLabel}
                        </span>
                        {groupCountLabel ? (
                          <span
                            className="shrink-0 text-[11px] font-semibold leading-tight text-sam-primary tabular-nums"
                            data-notification-group-count
                          >
                            {groupCountLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className="text-[11px] leading-tight text-sam-meta tabular-nums"
                          suppressHydrationWarning
                        >
                          {timeLabel}
                        </span>
                        {readState.showUnreadDot ? (
                          <span className={readState.dotClassName} data-notification-unread-dot>
                            <span className="sr-only">{t("notif_row_unread_sr")}</span>
                          </span>
                        ) : null}
                      </span>
                    </span>

                    {orderMetaLine ? (
                      <span className="mt-1 block truncate text-[11px] font-medium leading-snug text-sam-meta">
                        {orderMetaLine}
                      </span>
                    ) : null}

                    <span
                      className={`mt-1 block break-words text-[14px] leading-snug line-clamp-1 ${readState.titleClassName}`}
                    >
                      {item.displayTitle}
                    </span>

                    {snippet ? (
                      <span className="mt-0.5 block line-clamp-1 break-words text-[12px] leading-snug text-sam-muted">
                        {snippet}
                      </span>
                    ) : null}

                    {destinationHintKey ? (
                      <span
                        className="mt-1 block truncate text-[12px] font-semibold leading-snug text-sam-primary"
                        data-notification-destination-hint
                      >
                        {t(destinationHintKey)} ›
                      </span>
                    ) : null}
                  </span>

                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 관리자 업로드 원본(외부 저장소) 썸네일
                    <img
                      src={thumbUrl}
                      alt=""
                      loading="lazy"
                      className="mt-0.5 h-12 w-12 shrink-0 rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted object-cover"
                      data-notification-thumb
                    />
                  ) : null}

                  {!selectionMode && !destinationHintKey && !thumbUrl ? (
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
                <div className="flex shrink-0 flex-col items-center justify-start py-1 pr-0.5">
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
                    className="touch-manipulation flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect text-sam-muted transition active:bg-sam-pressed-surface active:text-sam-danger hover:bg-sam-surface-muted hover:text-sam-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
            </SwipeReadRow>
          </li>
        );
      })}
    </ul>
  );
}
