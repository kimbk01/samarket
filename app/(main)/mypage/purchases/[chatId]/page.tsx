import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PurchaseDetailView } from "@/components/mypage/purchases/PurchaseDetailView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { parseRoomId } from "@/lib/validate-params";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

export default function PurchaseDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PurchaseDetailPageBody params={params} />
    </Suspense>
  );
}

async function PurchaseDetailPageBody({ params }: PageProps) {
  const { chatId: raw } = await params;
  const chatId = parseRoomId(raw);
  if (!chatId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="text-center sam-text-body text-sam-muted">잘못된 경로입니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="구매 상세"
        subtitle="거래 진행·채팅"
        backHref="/mypage/purchases"
        hideCtaStrip
        stickyBelow={<MypagePurchaseSalesHubTabs />}
      />
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} space-y-2 py-4 pb-24`}>
        <PurchaseDetailView chatId={chatId} />
      </div>
    </div>
  );
}
