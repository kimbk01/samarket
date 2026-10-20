import { redirect } from "next/navigation";

/** 기존 경로 호환(판매자 상세 「받은 제안」 링크) — `/mypage/offers?tab=received` (최종 설계 S23) */
export default function MyOffersReceivedRedirectPage() {
  redirect("/mypage/offers?tab=received");
}
