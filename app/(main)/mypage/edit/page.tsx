import { redirect } from "next/navigation";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";

/** 레거시 직접 URL — 프로필 수정은 홈 위 시트 단일 표면(X1). */
export default function MypageEditRedirectPage() {
  redirect(MYPAGE_PROFILE_EDIT_SHEET_HREF);
}
