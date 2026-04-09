import type { ReactNode } from "react";
import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { ChatRoomList } from "@/components/chats/ChatRoomList";
import { PurchasesView } from "@/components/mypage/PurchasesView";
import { TradeReviewsManagementView } from "@/components/mypage/reviews/TradeReviewsManagementView";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";

export function TradeTab({ section }: { section: string }) {
  if (section === "sales") {
    return (
      <TabShell
        title="판매 내역"
        description="판매중, 예약중, 완료된 거래를 한 화면에서 관리합니다."
      >
        <SalesHistoryView />
      </TabShell>
    );
  }

  if (section === "purchases") {
    return (
      <TabShell
        title="구매 내역"
        description="구매 진행 상태와 구매 후 후기를 확인합니다."
      >
        <PurchasesView />
      </TabShell>
    );
  }

  if (section === "favorites") {
    return (
      <TabShell
        title="찜한 상품"
        description="관심 상품과 다시 보고 싶은 거래 글을 모아서 관리합니다."
      >
        <FavoriteProductsView embedded />
      </TabShell>
    );
  }

  if (section === "recent") {
    return (
      <TabShell
        title="최근 본 상품"
        description="최근에 확인한 상품을 다시 이어서 볼 수 있습니다."
      >
        <RecentViewedList />
      </TabShell>
    );
  }

  if (section === "chat") {
    return (
      <TabShell
        title="거래 채팅"
        description="거래 전용 채팅만 분리해서 확인합니다."
      >
        <div className="space-y-2 pb-6">
          <ChatRoomList
            segment="trade"
            getRoomHref={(roomId) => `/mypage/trade/chat/${encodeURIComponent(roomId)}`}
          />
        </div>
      </TabShell>
    );
  }

  if (section === "reviews") {
    return (
      <TabShell
        title="거래 후기"
        description="받은 후기, 작성한 후기, 후기 대기 상태를 관리합니다."
      >
        <TradeReviewsManagementView />
      </TabShell>
    );
  }

  return (
    <TabShell
      title="판매 내역"
      description="판매중, 예약중, 완료된 거래를 한 화면에서 관리합니다."
    >
      <SalesHistoryView />
    </TabShell>
  );
}

function TabShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <MyPageSectionHeader title={title} description={description} />
      <div className="rounded-[4px] border border-gray-200 bg-white p-3">{children}</div>
    </div>
  );
}
