import { redirect } from "next/navigation";

/** 프로필/계정 화면은 `/my/account`로 통합. */
export default function LegacyMypageProfileRedirect() {
  redirect("/mypage/account");
}
