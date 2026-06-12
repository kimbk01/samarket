import { redirect } from "next/navigation";

/** 레거시 mock 편집 — 실 매장 프로필 편집으로 통합 */
export default function BusinessEditRoute() {
  redirect("/stores/owner/profile");
}
