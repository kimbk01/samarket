import { redirect } from "next/navigation";

/** Legacy `/my/points/expiring` — canonical `/mypage/points/expiring`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/points/expiring");
}
