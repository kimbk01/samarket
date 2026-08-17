import { redirect } from "next/navigation";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";

/** CUT E — Marketplace MY default = sales (buyer history → Messenger trade list). */
export default function MypageTradeHubIndexPage() {
  redirect(MYPAGE_HOME_TRADE_SALES_HREF);
}
