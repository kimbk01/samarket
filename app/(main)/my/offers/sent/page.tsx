import { redirect } from "next/navigation";

/** Legacy `/my/offers/sent` — canonical `/mypage/offers?tab=sent` (1회 이동). */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/offers?tab=sent");
}
