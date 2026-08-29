import { redirect } from "next/navigation";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

/** CUT F — legacy Admin Store Sponsored surface → canonical Delivery Ads hub. */
export default async function AdminStoreInsertionsRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const raw = (await searchParams).focus;
  const focus = String(Array.isArray(raw) ? raw[0] : raw ?? "").toLowerCase();
  if (focus === "coupons") {
    redirect("/admin/store-coupon-control");
  }
  redirect(DELIVERY_AD_ADMIN_ROUTES.hub);
}
