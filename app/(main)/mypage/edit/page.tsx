import { redirect } from "next/navigation";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";

export default function MypageEditRedirectPage() {
  redirect(MYPAGE_PROFILE_EDIT_HREF);
}
