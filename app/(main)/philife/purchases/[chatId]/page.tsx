import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PurchaseDetailView } from "@/components/mypage/purchases/PurchaseDetailView";
import { HomePurchaseSalesHubTabs } from "@/components/mypage/HomePurchaseSalesHubTabs";
import { parseRoomId } from "@/lib/validate-params";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

export default function PhilifePurchaseDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PhilifePurchaseDetailPageBody params={params} />
    </Suspense>
  );
}

async function PhilifePurchaseDetailPageBody({ params }: PageProps) {
  const { chatId: raw } = await params;
  const chatId = parseRoomId(raw);
  const lang = resolveServerInitialLanguage({});
  if (!chatId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="text-center sam-text-body text-sam-muted">
          {translate(lang, "philife_purchase_detail_invalid_path")}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={translate(lang, "philife_purchase_detail_title")}
        backHref="/mypage/purchases"
        stickyBelow={<HomePurchaseSalesHubTabs />}
      />
      <div className="mx-auto max-w-4xl space-y-2 px-4 py-4 pb-24">
        <PurchaseDetailView chatId={chatId} purchasesListPath="/mypage/purchases" />
      </div>
    </div>
  );
}
