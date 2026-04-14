import { redirect } from "next/navigation";

/** 레거시 `/my/store-orders/:id/chat` → 통합 채팅 URL (클라이언트 replace 제거로 지연 없음) */
export default async function MyStoreOrderChatBridgePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) {
    redirect("/mypage/store-orders");
  }
  redirect(`/mypage/store-orders/${encodeURIComponent(orderId)}/chat`);
}
