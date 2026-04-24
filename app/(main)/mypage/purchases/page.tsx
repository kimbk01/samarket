import { PurchasesView } from "@/components/mypage/PurchasesView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypagePurchasesPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="거래 관리"
        subtitle="구매·예약·후기"
        backHref="/mypage"
        hideCtaStrip
        stickyBelow={<MypagePurchaseSalesHubTabs />}
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <PurchasesView />
      </div>
    </div>
  );
}
