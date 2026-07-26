import { redirect } from "next/navigation";

/** Legacy `/my/offers` — canonical `/mypage/offers`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/offers");
}
