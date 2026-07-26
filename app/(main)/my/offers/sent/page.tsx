import { redirect } from "next/navigation";

/** Legacy `/my/offers/sent` — canonical `/mypage/offers/sent`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/offers/sent");
}
