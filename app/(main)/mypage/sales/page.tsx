import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";

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
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} space-y-2 py-4 pb-24`}>
        <SalesHistoryView />
      </div>
    </div>
  );
}
