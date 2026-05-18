"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { ORDER_CHAT_SURFACE } from "@/lib/chats/surfaces/order-chat-surface";

type Item = {
  id: string;
  label: string;
  onClick?: () => void;
  href?: string;
  emoji: string;
};

/**
 * LINE 「서비스」 줄과 유사 — 가로 아이콘+짧은 라벨 (터치하기 쉬운 단순 메뉴).
 */
export function MessengerServiceStrip({
  onFindFriend,
  onCreateGroup,
}: {
  onFindFriend: () => void;
  onCreateGroup: () => void;
}) {
  const { t } = useI18n();
  const items: Item[] = [
    { id: "find", label: t("cm_ui_find_friends"), emoji: "🔍", onClick: onFindFriend },
    { id: "group", label: t("cm_ui_group"), emoji: "👥", onClick: onCreateGroup },
    {
      id: "trade",
      label: t("cm_ui_trade"),
      emoji: "💬",
      href: TRADE_CHAT_SURFACE.messengerListHref,
    },
    { id: "order", label: t("cm_ui_order"), emoji: "🛒", href: ORDER_CHAT_SURFACE.messengerDeliveryListHref },
  ];

  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("cm_ui_shortcuts")}</h2>
        <span className="sam-text-xxs text-sam-meta">{t("cm_ui_trade_order_stay_separate")}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((it) => {
          const body = (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sam-app sam-text-hero" aria-hidden>
                {it.emoji}
              </span>
              <span className="mt-1.5 block max-w-[72px] truncate text-center sam-text-xxs font-medium text-sam-fg">{it.label}</span>
            </>
          );
          if (it.href) {
            return (
              <Link
                key={it.id}
                href={it.href}
                className="flex flex-col items-center rounded-ui-rect py-2 transition hover:bg-sam-app active:bg-sam-surface-muted"
              >
                {body}
              </Link>
            );
          }
          return (
            <button
              key={it.id}
              type="button"
              onClick={it.onClick}
              className="flex flex-col items-center rounded-ui-rect py-2 transition hover:bg-sam-app active:bg-sam-surface-muted"
            >
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}
