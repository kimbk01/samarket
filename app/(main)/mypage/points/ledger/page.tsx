import { redirect } from "next/navigation";

/** Legacy ledger URL → Point Asset Home (Financial History). */
export default function MyPointsLedgerRedirectPage() {
  redirect("/mypage/points");
}
