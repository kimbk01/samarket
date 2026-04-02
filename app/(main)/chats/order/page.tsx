import { redirect } from "next/navigation";

/** 레거시 URL — 주문 채팅은 주문 허브 탭으로 통합 */
export default function ChatsOrderHubPage() {
  redirect("/my/store-orders");
}
