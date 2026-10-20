import { redirect } from "next/navigation";

/** 기존 경로 호환 — `/mypage/offers?tab=sent` (최종 설계 S23) */
export default function MyOffersSentRedirectPage() {
  redirect("/mypage/offers?tab=sent");
}
