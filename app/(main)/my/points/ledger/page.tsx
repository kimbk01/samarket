import { redirect } from "next/navigation";

/** Legacy `/my/points/ledger` — canonical `/mypage/points/ledger`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/points/ledger");
}
