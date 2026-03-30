import { redirect } from "next/navigation";

/** 소비자용 매장 주문은 `/my/store-orders`로 통합. */
export default function LegacyMypageStoreOrdersRedirect() {
  redirect("/my/store-orders");
}
