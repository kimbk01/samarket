import { redirect } from "next/navigation";

/** 거래 카테고리 관리는 `/admin/menus/trade` 한 곳 (같은 화면 중복 정리 — 거래 Admin 설계 v2 §B-3). */
export default function AdminCategoriesRedirect() {
  redirect("/admin/menus/trade");
}
