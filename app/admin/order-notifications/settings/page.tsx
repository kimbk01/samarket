import { redirect } from "next/navigation";

/** 알림 채널·푸시는 관리자 설정의 알림 메뉴로 통일 */
export default function AdminOrderNotificationsSettingsRedirectPage() {
  redirect("/admin/settings/notifications");
}
