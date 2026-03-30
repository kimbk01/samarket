import { redirect } from "next/navigation";

/** 로그아웃 화면은 `/my/logout`으로 통합. 기존 마이페이지 링크 호환용. */
export default function LegacyMypageLogoutRedirect() {
  redirect("/my/logout");
}
