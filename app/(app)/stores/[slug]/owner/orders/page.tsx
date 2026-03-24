import { redirect } from "next/navigation";

/** 구 `/stores/[slug]/owner/orders` → 사업자 통합 주문 관리 */
export default async function StoreOwnerOrdersPage() {
  redirect("/my/business/store-orders");
}
