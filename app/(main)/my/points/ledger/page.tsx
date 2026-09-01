import { redirect } from "next/navigation";

/** Legacy `/my/points/ledger` → Point Asset Home. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/points");
}
