import { redirect } from "next/navigation";

/** 구 허브 `/admin/menus` — 사이드바「메뉴 관리」제거 후 하단 탭 설정으로 보냄 */
export default function AdminMenusIndexRedirect() {
  redirect("/admin/menus/main-bottom-nav");
}
