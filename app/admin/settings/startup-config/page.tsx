import { redirect } from "next/navigation";

/**
 * 앱 진입 어드민 v3 §5 (Owner 2026-11-17 「v3대로 진행」): 「앱 첫 진입 화면」은 OS 시작 화면과 한 화면
 * (광고·배너 › 앱 진입 › OS 시작 화면·첫 진입 화면). 옛 링크는 그 화면으로 보낸다.
 */
export default function AdminStartupConfigLegacyRedirect() {
  redirect("/admin/platform-promotion/os-start");
}
