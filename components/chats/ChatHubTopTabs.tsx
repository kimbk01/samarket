"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildChatHubTopTabDefs } from "@/lib/chats/surfaces/chat-hub-tab-defs";
import type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";
import { DIBAY_SECONDARY_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

export type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";

/**
 * Chat hub page-nav — DIBAY secondary visual SSOT (pill).
 * Existing segments/hrefs/scrollIntoView only — no feature add.
 */
export function ChatHubTopTabs({
  active,
  orderChatsHref = "/community-messenger/delivery-chats",
  showOrderTab = true,
}: {
  active: ChatHubSegment;
  orderChatsHref?: string;
  showOrderTab?: boolean;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<ChatHubSegment, HTMLAnchorElement | null>>({ trade: null, order: null });

  const tabs = buildChatHubTopTabDefs({ orderChatsHref, showOrderTab });

  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    const tabEl = tabRefs.current[active];
    if (!scrollEl || !tabEl) return;
    tabEl.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
  }, [active, orderChatsHref, showOrderTab]);

  return (
    <nav
      ref={scrollRef}
      className={DIBAY_SECONDARY_TABS_CLASS}
      aria-label={t("nav_trade_hub_chat")}
      role="tablist"
    >
      {tabs.map(({ segment, href, label, labelKey }) => {
        const isOn = active === segment;
        return (
          <Link
            key={segment}
            ref={(el) => {
              tabRefs.current[segment] = el;
            }}
            href={href}
            prefetch={false}
            role="tab"
            aria-selected={isOn}
            aria-current={isOn ? "page" : undefined}
            className={dibaySecondaryTabClass(isOn)}
          >
            {labelKey ? t(labelKey) : label}
          </Link>
        );
      })}
    </nav>
  );
}
