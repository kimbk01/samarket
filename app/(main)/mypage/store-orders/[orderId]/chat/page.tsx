import { redirect } from "next/navigation";

/** 레거시 마이페이지 주문 채팅 — canonical `/orders/store/:id/chat` 으로 수렴 */
export default async function MypageStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) redirect("/orders");
  redirect(`/orders/store/${encodeURIComponent(orderId)}/chat`);
}
