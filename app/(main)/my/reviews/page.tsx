import { redirect } from "next/navigation";

/**
 * 거래 후기 없음(Owner 2026-10-28) — 예전 주소는 판매자 관리(`/mypage/products`)로 보낸다.
 * X-3: next.config HTTP 307 이 우선이고, 이 파일은 폴백으로 최종 목적지에 한 번만 redirect 한다(연쇄 RSC redirect 금지).
 */
export default function MyReviewsPage() {
  redirect("/mypage/products");
}
