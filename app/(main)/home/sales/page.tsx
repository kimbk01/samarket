import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { HomePurchaseSalesHubTabs } from "@/components/mypage/HomePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function HomeSalesPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="거래 관리"
        backHref="/home"
        stickyBelow={<HomePurchaseSalesHubTabs />}
      />
      <div className="mx-auto max-w-lg space-y-2 px-4 py-4 pb-24">
        <SalesHistoryView />
      </div>
    </div>
  );
}
