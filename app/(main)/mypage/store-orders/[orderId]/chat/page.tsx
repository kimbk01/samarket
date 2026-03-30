import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ orderId: string }>;
}

/** 소비자용 매장 주문 채팅은 `/my/store-orders/:id/chat`으로 통합. */
export default async function LegacyMypageStoreOrderChatRedirect({ params }: PageProps) {
  const { orderId } = await params;
  redirect(`/my/store-orders/${encodeURIComponent(orderId)}/chat`);
}
