import { PurchasesView } from "@/components/mypage/PurchasesView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";

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
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} space-y-2 py-4 pb-24`}>
        <PurchasesView />
      </div>
    </div>
  );
}
