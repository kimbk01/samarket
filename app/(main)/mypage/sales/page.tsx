import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageSalesPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="거래 관리"
        subtitle="판매·예약·완료"
        backHref="/mypage"
        hideCtaStrip
        stickyBelow={<MypagePurchaseSalesHubTabs />}
      />
      <div className="mx-auto max-w-lg space-y-2 px-4 py-4 pb-24">
        <SalesHistoryView />
      </div>
    </div>
  );
}
