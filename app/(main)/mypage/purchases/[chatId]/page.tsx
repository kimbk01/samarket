import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import {
  PurchaseDetailInvalidRoute,
  PurchaseDetailRouteChrome,
} from "@/components/mypage/purchases/PurchaseDetailRouteChrome";
import { PurchaseDetailView } from "@/components/mypage/purchases/PurchaseDetailView";
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
    return <PurchaseDetailInvalidRoute />;
  }

  return (
    <PurchaseDetailRouteChrome>
      <PurchaseDetailView chatId={chatId} />
    </PurchaseDetailRouteChrome>
  );
}
