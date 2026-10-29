import { redirect } from "next/navigation";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

/**
 * 5-F — 배달 배너 생성 화면은 1개로 (전 배치·업종 대상·용량 검사를 가진 `/admin/delivery-ads/first-party/new`).
 * 기존 링크·북마크는 그 화면으로 보낸다.
 */
export default function AdminAdsDirectDeliveryPage() {
  redirect(DELIVERY_AD_ADMIN_ROUTES.firstPartyNew);
}
