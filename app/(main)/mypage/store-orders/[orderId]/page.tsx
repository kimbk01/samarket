import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ orderId: string }>;
}

/** 소비자용 매장 주문 상세는 `/my/store-orders/:id`로 통합. */
export default async function LegacyMypageStoreOrderDetailRedirect({ params }: PageProps) {
  const { orderId } = await params;
  redirect(`/my/store-orders/${encodeURIComponent(orderId)}`);
}
