"use client";

import { Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { TRADE_HUB_LIST_ITEM_CARD_CLASS } from "@/lib/ui/app-content-layout";

const CHAT_UNREAD_BADGE =
  "inline-flex min-w-[1.125rem] shrink-0 items-center justify-center rounded-md bg-violet-500/15 px-1 py-0.5 text-[10px] font-bold leading-none text-violet-800";
const OTHER_UNREAD_BADGE =
  "inline-flex min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-sam-surface-muted px-1 py-0.5 text-[9px] font-semibold text-sam-muted";
const SURFACE_BADGE =
  "inline-flex max-w-[min(100%,14rem)] shrink-0 items-center truncate rounded-md bg-sam-surface-muted px-1 py-0.5 text-[10px] font-semibold leading-tight text-sam-fg";

type Props = {
  items: InboxGroupItem[];
  onActivate: (item: InboxGroupItem) => void;
  /** 항목 삭제(그룹이면 묶인 id 전부). 없으면 삭제 버튼 미표시 */
  onDelete?: (item: InboxGroupItem) => void | Promise<void>;
  /** 삭제 요청 중인 그룹 `item.key` — 해당 행만 버튼 비활성 */
  deleteBusyKey?: string | null;
  /** 필라이프 드롭다운 — 살짝 촘촘 */
  compact?: boolean;
  /** 비어 있을 때 */
  emptyLabel: string;
};

/**
 * 그룹화된 인앱 알림 — 본문은 클릭 시 `onActivate`, 삭제는 별도 버튼.
 */
export function InboxGroupCardList({
  items,
  onActivate,
  onDelete,
  deleteBusyKey,
  compact,
  emptyLabel,
}: Props) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <p className="text-[12px] leading-snug text-sam-muted">{emptyLabel}</p>;
  }
  const pad = compact ? "px-2.5 py-2" : "sam-card-pad";
  const railPad = compact ? "px-2 py-2" : "sam-card-pad-x py-3";
  return (
    <ul className="min-w-0 space-y-2">
      {items.map((item) => {
        const kind = item.kindLabel;
        const hasUnread = item.unreadCount > 0;
        const isChat = item.notification_type === "chat";
        const deleting = deleteBusyKey === item.key;
        return (
          <li key={item.key}>
            <div className={`flex ${TRADE_HUB_LIST_ITEM_CARD_CLASS}`}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => onActivate(item)}
                className={`min-w-0 flex-1 text-left transition active:bg-sam-surface-muted disabled:opacity-60 ${pad}`}
              >
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-tight text-sam-meta">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                    <span className={SURFACE_BADGE} title={item.surfaceBadge}>
                      {item.surfaceBadge}
                    </span>
                    {kind ? <span className="truncate text-sam-meta">· {kind}</span> : null}
                  </span>
                  {hasUnread ? (
                    isChat ? (
                      <span
                        className={CHAT_UNREAD_BADGE}
                        title={t("notif_inbox_unread_n", { n: item.unreadCount })}
                      >
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </span>
                    ) : (
                      <span className={OTHER_UNREAD_BADGE}>{item.unreadCount}</span>
                    )
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 break-words text-[14px] font-semibold leading-snug text-sam-fg">
                  {item.displayTitle}
                </p>
                {item.body ? (
                  <p className="mt-0.5 line-clamp-2 break-words text-[12px] leading-snug text-sam-fg">
                    {item.body}
                  </p>
                ) : null}
              </button>
              <div
                className={`flex shrink-0 flex-col items-end gap-0.5 bg-transparent ${railPad} ${
                  onDelete ? "justify-between" : "justify-end"
                }`}
              >
                {onDelete ? (
                  <button
                    type="button"
                    disabled={deleting}
                    aria-label={t("notif_inbox_delete_aria")}
                    title={t("notif_inbox_delete_aria")}
                    onClick={(e) => {
                      e.preventDefault();
                      void onDelete(item);
                    }}
                    className="touch-manipulation flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-sam-muted shadow-none outline-none ring-0 [-webkit-tap-highlight-color:transparent] transition hover:bg-sam-surface-muted/80 hover:text-red-600 focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
                <span className="text-[10px] leading-tight text-sam-meta" suppressHydrationWarning>
                  {new Date(item.created_at).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
