import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageSalesPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="거래 관리"
        subtitle="판매·예약·완료"
        backHref="/mypage"
        hideCtaStrip
        stickyBelow={<MypagePurchaseSalesHubTabs />}
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <SalesHistoryView />
      </div>
    </div>
  );
}
