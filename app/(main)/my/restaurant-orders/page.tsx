import { redirect } from "next/navigation";

/** 구 식당·배달 샘플 목록 URL → 실매장 주문(내정보·매장 주문)으로 통합 */
export default function MyRestaurantOrdersPage() {
  redirect("/my/store-orders");
}
