"use client";

import type { ReactNode } from "react";
import { FavoritesHubView } from "@/components/favorites/FavoritesHubView";
import { ChatRoomList } from "@/components/chats/ChatRoomList";
import { TradeReviewsManagementView } from "@/components/mypage/reviews/TradeReviewsManagementView";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import { TRADE_CHAT_SURFACE, tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function TradeTab({ section }: { section: string }) {
  const { t, safeT } = useI18n();
  if (section === "sales") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_trade_sales_label")}
        description={t("mypage_comp_nav_sec_trade_sales_desc")}
      >
        <SalesHistoryView />
      </TabShell>
    );
  }

  if (section === "purchases") {
    return (
      <TabShell
        title={safeT("nav_trade_hub_chat")}
        description={t("mypage_comp_nav_sec_trade_chat_desc")}
      >
        <p className="sam-text-body text-sam-muted">{t("nav_chat_trade_empty")}</p>
        <a
          href={TRADE_CHAT_SURFACE.messengerListHref}
          className="mt-4 inline-flex rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-white"
        >
          {t("nav_trade_hub_chat")}
        </a>
      </TabShell>
    );
  }

  if (section === "favorites") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_trade_favorites_label")}
        description={t("mypage_comp_nav_sec_trade_favorites_desc")}
      >
        <FavoritesHubView embedded />
      </TabShell>
    );
  }

  if (section === "recent") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_trade_recent_label")}
        description={t("mypage_comp_nav_sec_trade_recent_desc")}
      >
        <RecentViewedList />
      </TabShell>
    );
  }

  if (section === "chat") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_trade_chat_label")}
        description={t("mypage_comp_nav_sec_trade_chat_desc")}
      >
        <div className="space-y-2 pb-6">
          <ChatRoomList
            segment="trade"
            getRoomHref={(roomId, room) => tradeHubChatRoomHref(roomId, room.source)}
          />
        </div>
      </TabShell>
    );
  }

  if (section === "reviews") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_trade_reviews_label")}
        description={t("mypage_comp_nav_sec_trade_reviews_desc")}
      >
        <TradeReviewsManagementView />
      </TabShell>
    );
  }

  return (
    <TabShell
      title={safeT("mypage_comp_nav_sec_trade_sales_label")}
      description={t("mypage_comp_nav_sec_trade_sales_desc")}
    >
      <SalesHistoryView />
    </TabShell>
  );
}

function TabShell({
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <MyPageSectionHeader description={description} />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">{children}</div>
    </div>
  );
}
