import { redirect } from "next/navigation";
import { MYPAGE_HOME_TRADE_HUB_HREF } from "@/lib/mypage/mypage-home-hub-links";

/** Slice 5: legacy purchases shell → trade hub SSOT */
export default function MypagePurchasesLegacyRedirectPage() {
  redirect(MYPAGE_HOME_TRADE_HUB_HREF);
}
