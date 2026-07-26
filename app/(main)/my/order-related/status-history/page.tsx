import { redirect } from "next/navigation";

/** Legacy `/my/order-related/status-history` — canonical `/mypage/store-orders`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/store-orders");
}
