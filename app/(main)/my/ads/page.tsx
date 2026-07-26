import { redirect } from "next/navigation";

/** Legacy `/my/ads` — canonical `/mypage/ads`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/ads");
}
