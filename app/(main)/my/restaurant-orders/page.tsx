import { redirect } from "next/navigation";

/** Legacy `/my/restaurant-orders` — canonical `/mypage/store-orders`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/store-orders");
}
