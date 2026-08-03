"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { resolveInboxOrderMetaLine } from "@/lib/notifications/inbox-order-status-label";
import { TRADE_HUB_LIST_ITEM_CARD_CLASS } from "@/lib/ui/app-content-layout";

const CHAT_UNREAD_BADGE =
  "inline-flex min-w-[1.125rem] shrink-0 items-center justify-center rounded-md bg-violet-500/15 px-1 py-0.5 text-[10px] font-bold leading-none text-violet-800";
const ORDER_STATUS_CHIP =
  "inline-flex shrink-0 items-center rounded-md bg-[color:var(--delivery-primary,#0B421A)]/12 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-[color:var(--delivery-primary,#0B421A)]";
const SURFACE_BADGE =
  "inline-flex max-w-[min(100%,14rem)] shrink-0 items-center truncate rounded-md bg-sam-surface-muted px-1 py-0.5 text-[10px] font-semibold leading-tight text-sam-fg";

type Props = {
  items: InboxGroupItem[];
  onActivate: (item: InboxGroupItem) => void;
  /** 행 호버·터치 전에 채팅 부트스트랩 선기동 */
  onItemWarm?: (item: InboxGroupItem) => void;
  renderActions?: (item: InboxGroupItem) => ReactNode;
  /** 항목 삭제(그룹이면 묶인 id 전부). 없으면 삭제 버튼 미표시 */
  onDelete?: (item: InboxGroupItem) => void | Promise<void>;
  /** 삭제 요청 중인 그룹 `item.key` — 해당 행만 버튼 비활성 */
  deleteBusyKey?: string | null;
  /** 필라이프 드롭다운 — 살짝 촘촘 */
  compact?: boolean;
  /**
   * Bell preview sheet — 「어디에 무엇이」만 (카테고리 뱃지 + 짧은 제목).
   * 본문·주문 디테일·긴 메타는 전체 알림에서만 표시.
   */
  summaryOnly?: boolean;
  /** 비어 있을 때 */
  emptyLabel: string;
  /** Notification Center — multi-select with radio-style controls */
  selectionMode?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (item: InboxGroupItem) => void;
};

/**
 * 그룹화된 인앱 알림 — 본문은 클릭 시 `onActivate`, 삭제는 별도 버튼.
 * `selectionMode` 에서는 원형 선택 컨트롤로 개별 선택(전체 선택·읽음·삭제는 상위 툴바).
 */
export function InboxGroupCardList({
  items,
  onActivate,
  onItemWarm,
  renderActions,
  onDelete,
  deleteBusyKey,
  compact,
  summaryOnly = false,
  emptyLabel,
  selectionMode = false,
  selectedKeys,
  onToggleSelect,
}: Props) {
  const { t, language } = useI18n();
  if (items.length === 0) {
    return <p className="text-[12px] leading-snug text-sam-muted">{emptyLabel}</p>;
  }
  const pad = compact || summaryOnly ? "px-2.5 py-2" : "sam-card-pad";
  const railPad = compact || summaryOnly ? "px-2 py-2" : "sam-card-pad-x py-3";
  const hideDelete = summaryOnly || !onDelete || selectionMode;
  return (
    <ul className={`min-w-0 ${summaryOnly ? "space-y-1" : "space-y-2"}`}>
      {items.map((item) => {
        const kind = item.kindLabel;
        const hasUnread = item.unreadCount > 0;
        const isChat = item.notification_type === "chat";
        const isOrderGroup = item.isOrderGroup;
        const orderMetaLine =
          !summaryOnly && isOrderGroup ? resolveInboxOrderMetaLine(item.meta) : null;
        const showBody =
          !summaryOnly && item.body && !(isOrderGroup && item.body === item.displayTitle);
        const deleting = deleteBusyKey === item.key;
        const selected = selectionMode && (selectedKeys?.has(item.key) ?? false);
        const unreadBadge =
          hasUnread && item.unreadCount > 1
            ? item.unreadCount > 99
              ? "99+"
              : String(item.unreadCount)
            : null;
        return (
          <li key={item.key}>
            <div
              className={`flex ${
                summaryOnly
                  ? "min-w-0 rounded-ui-rect hover:bg-sam-muted/10 active:bg-sam-muted/15"
                  : TRADE_HUB_LIST_ITEM_CARD_CLASS
              } ${selected ? "ring-1 ring-signature/40" : ""}`}
            >
              {selectionMode ? (
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={t("notif_center_select_row_aria")}
                  disabled={deleting}
                  onClick={() => onToggleSelect?.(item)}
                  className={`flex shrink-0 items-center justify-center ${railPad} disabled:opacity-50`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      selected
                        ? "border-signature bg-signature text-white"
                        : "border-sam-border bg-sam-surface"
                    }`}
                  >
                    {selected ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
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
                  className={`min-w-0 w-full text-left transition active:bg-sam-surface-muted disabled:opacity-60 ${pad}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-tight text-sam-meta">
                        <span className={SURFACE_BADGE} title={item.surfaceBadge}>
                          {item.surfaceBadge}
                        </span>
                        {!summaryOnly && kind && isOrderGroup ? (
                          <span className={ORDER_STATUS_CHIP}>{kind}</span>
                        ) : null}
                        {!summaryOnly && kind && !isOrderGroup ? (
                          <span className="truncate text-sam-meta">· {kind}</span>
                        ) : null}
                        {summaryOnly && kind && kind !== item.surfaceBadge ? (
                          <span className="truncate text-sam-meta">· {kind}</span>
                        ) : null}
                      </div>
                      {orderMetaLine ? (
                        <p className="mt-0.5 truncate text-[11px] font-medium leading-snug text-sam-meta">
                          {orderMetaLine}
                        </p>
                      ) : null}
                      <p
                        className={`mt-0.5 break-words font-semibold leading-snug text-sam-fg ${
                          summaryOnly
                            ? "line-clamp-1 text-[13px]"
                            : "line-clamp-2 text-[14px]"
                        }`}
                      >
                        {item.displayTitle}
                      </p>
                      {showBody ? (
                        <p className="mt-0.5 line-clamp-2 break-words text-[12px] leading-snug text-sam-fg">
                          {item.body}
                        </p>
                      ) : null}
                    </div>
                    {summaryOnly && unreadBadge ? (
                      <span
                        className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                        title={t("notif_inbox_unread_n", { n: item.unreadCount })}
                      >
                        {unreadBadge}
                      </span>
                    ) : null}
                    {!summaryOnly && hasUnread && isChat ? (
                      <span
                        className={CHAT_UNREAD_BADGE}
                        title={t("notif_inbox_unread_n", { n: item.unreadCount })}
                      >
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </span>
                    ) : null}
                    {!summaryOnly && hasUnread && !isChat ? (
                      <span
                        className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-signature"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                </button>
                {renderActions && !selectionMode && !summaryOnly ? (
                  <div className="px-3 pb-3">{renderActions(item)}</div>
                ) : null}
              </div>
              {!summaryOnly ? (
                <div
                  className={`flex shrink-0 flex-col items-end gap-0.5 bg-transparent ${railPad} ${
                    !hideDelete ? "justify-between" : "justify-end"
                  }`}
                >
                  {!hideDelete ? (
                    <button
                      type="button"
                      disabled={deleting}
                      aria-label={t("notif_inbox_delete_aria")}
                      title={t("notif_inbox_delete_aria")}
                      onClick={(e) => {
                        e.preventDefault();
                        void onDelete?.(item);
                      }}
                      className="touch-manipulation flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-sam-muted shadow-none outline-none ring-0 [-webkit-tap-highlight-color:transparent] transition hover:bg-sam-surface-muted/80 hover:text-red-600 focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                  ) : null}
                  <span className="text-[10px] leading-tight text-sam-meta" suppressHydrationWarning>
                    {new Date(item.created_at).toLocaleString(language === "ko" ? "ko-KR" : "en-US", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
