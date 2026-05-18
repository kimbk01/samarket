"use client";

import type { ReactNode } from "react";
import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { ChatRoomList } from "@/components/chats/ChatRoomList";
import { PurchasesView } from "@/components/mypage/PurchasesView";
import { TradeReviewsManagementView } from "@/components/mypage/reviews/TradeReviewsManagementView";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function TradeTab({ section }: { section: string }) {
  const { t } = useI18n();
  if (section === "sales") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_trade_sales_label")}
        description={t("mypage_comp_nav_sec_trade_sales_desc")}
      >
        <SalesHistoryView />
      </TabShell>
    );
  }

  if (section === "purchases") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_trade_purchases_label")}
        description={t("mypage_comp_nav_sec_trade_purchases_desc")}
      >
        <PurchasesView />
      </TabShell>
    );
  }

  if (section === "favorites") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_trade_favorites_label")}
        description={t("mypage_comp_nav_sec_trade_favorites_desc")}
      >
        <FavoriteProductsView embedded />
      </TabShell>
    );
  }

  if (section === "recent") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_trade_recent_label")}
        description={t("mypage_comp_nav_sec_trade_recent_desc")}
      >
        <RecentViewedList />
      </TabShell>
    );
  }

  if (section === "chat") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_trade_chat_label")}
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
        title={t("mypage_comp_nav_sec_trade_reviews_label")}
        description={t("mypage_comp_nav_sec_trade_reviews_desc")}
      >
        <TradeReviewsManagementView />
      </TabShell>
    );
  }

  return (
    <TabShell
      title={t("mypage_comp_nav_sec_trade_sales_label")}
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
