import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PurchaseDetailView } from "@/components/mypage/purchases/PurchaseDetailView";
import { MypagePurchaseSalesHubTabs } from "@/components/mypage/MypagePurchaseSalesHubTabs";
import { parseRoomId } from "@/lib/validate-params";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

export default async function PurchaseDetailPage({ params }: PageProps) {
  const { chatId: raw } = await params;
  const chatId = parseRoomId(raw);
  if (!chatId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="text-center text-[14px] text-gray-500">잘못된 경로입니다.</p>
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
      <div className="mx-auto max-w-lg space-y-2 px-4 py-4 pb-24">
        <PurchaseDetailView chatId={chatId} />
      </div>
    </div>
  );
}
