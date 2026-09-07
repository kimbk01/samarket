import { redirect } from "next/navigation";

/**
 * PUBLIC control-plane hub retired → 전체 광고.
 * Delivery manage / inventory / commercial keep deep routes under legacy absorb.
 */
export default function AdminDeliveryAdsControlRedirectPage() {
  redirect("/admin/advertising");
}
