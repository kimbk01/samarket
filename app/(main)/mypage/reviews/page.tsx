import { redirect } from "next/navigation";

/** Slice 5: legacy written-reviews hub → trade reviews SSOT */
export default function MypageReviewsLegacyRedirectPage() {
  redirect("/mypage/trade/reviews");
}
