import { PurchasesView } from "@/components/mypage/PurchasesView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypagePurchasesPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="거래 관리"
        subtitle="구매·예약·후기"
        backHref="/mypage"
        hideCtaStrip
        stickyBelow={<MypagePurchaseSalesHubTabs />}
      />
      <div className="mx-auto max-w-lg space-y-2 px-4 py-4 pb-24">
        <PurchasesView />
      </div>
    </div>
  );
}
