import { redirect } from "next/navigation";

/** 레거시·딥링크용 — 내정보 설정의 기기 권한 화면으로 통합 */
export default function SettingsPermissionsPage() {
  redirect("/mypage/section/settings/device-permissions");
}
