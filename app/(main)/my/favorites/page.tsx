import { redirect } from "next/navigation";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

/** 구 북마크 호환 — 거래 허브 찜 목록으로 통일 */
export default function MyFavoritesPage() {
  redirect(MYPAGE_TRADE_FAVORITES_HREF);
}
