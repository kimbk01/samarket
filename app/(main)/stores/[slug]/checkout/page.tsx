import { redirect } from "next/navigation";

/** 샘플 배달 결제 제거 — 실매장 주문은 장바구니·결제 UI에서만 진행 */
export default async function StoreCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  redirect(`/stores/${encodeURIComponent(safe)}/cart`);
}
