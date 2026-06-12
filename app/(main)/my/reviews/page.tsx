import { redirect } from "next/navigation";

/** 레거시 `/my/reviews` → 거래 후기 관리(실 DB) */
export default function MyReviewsPage() {
  redirect("/mypage/trade/reviews");
}
