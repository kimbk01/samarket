"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildChatHubTopTabDefs } from "@/lib/chats/surfaces/chat-hub-tab-defs";
import type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import {
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";

export type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";

/**
 * Chat hub page-nav — Community / Trade / Messenger 와 동일 DibaySecondaryTabRow SSOT.
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
  const tabs = buildChatHubTopTabDefs({ orderChatsHref, showOrderTab });

  return (
    <DibaySecondaryTabRow bordered trackAriaLabel={t("nav_trade_hub_chat")}>
      {tabs.map(({ segment, href, label, labelKey }) => {
        const isOn = active === segment;
        return (
          <Link
            key={segment}
            href={href}
            prefetch={false}
            role="tab"
            aria-selected={isOn}
            aria-current={isOn ? "page" : undefined}
            className={dibaySecondaryTabClass(isOn)}
          >
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>
              {labelKey ? t(labelKey) : label}
            </span>
          </Link>
        );
      })}
    </DibaySecondaryTabRow>
  );
}
