import { redirect } from "next/navigation";

/** Legacy `/my/offers/received` — canonical `/mypage/offers/received`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/offers/received");
}
