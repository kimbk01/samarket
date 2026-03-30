import { redirect } from "next/navigation";

/** 설정 허브는 `/my/settings`로 통합. 기존 마이페이지 링크 호환용. */
export default function LegacyMypageSettingsRedirect() {
  redirect("/my/settings");
}
