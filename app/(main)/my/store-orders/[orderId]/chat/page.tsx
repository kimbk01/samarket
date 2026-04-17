import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

/** 레거시 `/my/store-orders/:id/chat` → 통합 채팅 URL (클라이언트 replace 제거로 지연 없음) */
export default function MyStoreOrderChatBridgePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <MyStoreOrderChatBridgePageBody params={params} />
    </Suspense>
  );
}

async function MyStoreOrderChatBridgePageBody({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) {
    return redirect("/mypage/store-orders");
  }
  return redirect(`/mypage/store-orders/${encodeURIComponent(orderId)}/chat`);
}
