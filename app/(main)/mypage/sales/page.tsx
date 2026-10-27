import { redirect } from "next/navigation";

/**
 * Slice 5: legacy sales shell → 판매자 관리(`/mypage/products`).
 * X-3: next.config HTTP 307 이 우선이고, 이 파일은 폴백으로 최종 목적지에 한 번만 redirect 한다(연쇄 RSC redirect 금지).
 */
export default function MypageSalesLegacyRedirectPage() {
  redirect("/mypage/products");
}
