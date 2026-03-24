import { redirect } from "next/navigation";

/** 목록은 `/mypage/store-orders`로 통합. 북마크·알림 구 URL 호환용. */
export default function LegacyStoreOrdersListRedirect() {
  redirect("/mypage/store-orders");
}
