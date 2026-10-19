import { redirect } from "next/navigation";

/** J-AMD-4: duplicate of 거래흐름·온도 complete panel — redirect only (not a menu leaf). */
export default function AdminTradeCompleteRoute() {
  redirect("/admin/trade-flow?panel=complete");
}
