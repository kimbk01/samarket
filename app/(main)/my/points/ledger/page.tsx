import { redirect } from "next/navigation";

/** Legacy `/my/points/ledger` → D-Point Asset Home. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/points");
}
