import { redirect } from "next/navigation";

/** Legacy `/my/trust` — canonical `/mypage/trust`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/trust");
}
