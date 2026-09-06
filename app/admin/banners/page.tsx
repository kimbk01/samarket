import { redirect } from "next/navigation";

/**
 * MERGE: /admin/banners is not Ads ops authority.
 * Delivery banners → Delivery Ads; platform popups → platform-popup.
 */
export default function AdminBannersPage() {
  redirect("/admin/delivery-ads");
}
