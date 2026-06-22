import { redirect } from "next/navigation";
import { MYPAGE_SETTINGS_HREF } from "@/lib/mypage/mypage-profile-routes";

/** 설정 홈 폐기 — 내정보(`/mypage`)로 통합. 하위 `/mypage/settings/*` 레거시는 `[section]` 리다이렉트 유지 */
export default function MypageSettingsPage() {
  redirect(MYPAGE_SETTINGS_HREF);
}
