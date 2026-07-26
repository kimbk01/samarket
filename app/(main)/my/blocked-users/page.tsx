import { redirect } from "next/navigation";

/** Legacy `/my/blocked-users` — canonical `/mypage/section/account/blocked-users`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/section/account/blocked-users");
}
