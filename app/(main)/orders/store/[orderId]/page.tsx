import { redirect } from "next/navigation";

/** 레거시·딥링크 — 목록 카드 펼침(`/orders?expand=`)으로 통합 */
export default async function OrdersHubStoreOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const id = typeof orderId === "string" ? orderId.trim() : "";
  if (!id) redirect("/orders");
  redirect(`/orders?expand=${encodeURIComponent(id)}`);
}
