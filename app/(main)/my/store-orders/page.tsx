import { redirect } from "next/navigation";

/** 소비자용 매장 주문 목록은 `/mypage/store-orders`로 정규화. */
export default function MyStoreOrdersPage() {
  redirect("/mypage/store-orders");
}
