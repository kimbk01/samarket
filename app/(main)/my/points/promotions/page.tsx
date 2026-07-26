import { redirect } from "next/navigation";

/** Legacy `/my/points/promotions` — canonical `/mypage/points/promotions`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/points/promotions");
}
