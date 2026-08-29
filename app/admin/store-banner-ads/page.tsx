import { redirect } from "next/navigation";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

/** CUT F — legacy Admin Banner surface → canonical Delivery Ads hub. */
export default function AdminStoreBannerAdsRoutePage() {
  redirect(DELIVERY_AD_ADMIN_ROUTES.hub);
}
