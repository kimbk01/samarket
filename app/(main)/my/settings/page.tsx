import { redirect } from "next/navigation";
import { MYPAGE_SETTINGS_HREF } from "@/lib/mypage/mypage-profile-routes";

/** 레거시 `/my/settings` → `/mypage/settings` */
export default function MySettingsPage() {
  redirect(MYPAGE_SETTINGS_HREF);
}
