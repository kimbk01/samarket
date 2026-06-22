import { redirect } from "next/navigation";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-profile-routes";

export default function MypageEditRedirectPage() {
  redirect(MYPAGE_PROFILE_EDIT_HREF);
}
