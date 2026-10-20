import { redirect } from "next/navigation";

/** Legacy `/my/offers/received` — canonical `/mypage/offers?tab=received` (1회 이동). */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/offers?tab=received");
}
