import { redirect } from "next/navigation";

/** Legacy `/my/regions` — canonical `/mypage/addresses`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/addresses");
}
