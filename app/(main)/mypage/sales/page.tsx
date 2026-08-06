import { redirect } from "next/navigation";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";

/** Slice 5: legacy sales shell → trade hub SSOT */
export default function MypageSalesLegacyRedirectPage() {
  redirect(MYPAGE_HOME_TRADE_SALES_HREF);
}
