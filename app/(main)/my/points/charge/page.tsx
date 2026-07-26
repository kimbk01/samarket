import { redirect } from "next/navigation";

/** Legacy `/my/points/charge` — canonical `/mypage/points/charge`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/points/charge");
}
