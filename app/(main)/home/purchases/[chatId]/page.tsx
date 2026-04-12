import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PurchaseDetailView } from "@/components/mypage/purchases/PurchaseDetailView";
import { HomePurchaseSalesHubTabs } from "@/components/mypage/HomePurchaseSalesHubTabs";
import { parseRoomId } from "@/lib/validate-params";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

export default async function HomePurchaseDetailPage({ params }: PageProps) {
  const { chatId: raw } = await params;
  const chatId = parseRoomId(raw);
  if (!chatId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="text-center text-[14px] text-sam-muted">잘못된 경로입니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="구매 상세"
        backHref="/home/purchases"
        stickyBelow={<HomePurchaseSalesHubTabs />}
      />
      <div className="mx-auto max-w-4xl space-y-2 px-4 py-4 pb-24">
        <PurchaseDetailView chatId={chatId} purchasesListPath="/home/purchases" />
      </div>
    </div>
  );
}
