import { redirect } from "next/navigation";

/** 찜 기록은 거래 Admin 운영 기록의 「찜 기록」 탭 (거래 Admin 설계 v2 §F-4). */
export default function AdminFavoritesRedirect() {
  redirect("/admin/trade/audit?tab=favorites");
}
