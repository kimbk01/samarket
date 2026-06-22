import { redirect } from "next/navigation";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

/** 레거시 — 프로필·수정은 `/mypage` 한 페이지 */
export default function MypageProfileEditRedirectPage() {
  redirect(MYPAGE_MAIN_HREF);
}
