import { redirect } from "next/navigation";

/** 이전 거래 광고(신규 신청 중단·운영 0건)는 거래 홍보 화면으로 통합 (거래 Admin 설계 v2 §B-3 · D-23). */
export default function AdminTradePostAdsRedirect() {
  redirect("/admin/trade/promotions?tab=all");
}
