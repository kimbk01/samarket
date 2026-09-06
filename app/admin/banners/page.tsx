import { redirect } from "next/navigation";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

/**
 * MERGE: /admin/banners is not Ads ops authority.
 * Delivery banners → Delivery Ads hub; platform popups → platform-popup.
 */
export default function AdminBannersPage() {
  redirect(DELIVERY_AD_ADMIN_ROUTES.hub);
}
