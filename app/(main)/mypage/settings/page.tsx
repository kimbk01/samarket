import { redirect } from "next/navigation";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

export default function MypageSettingsPage() {
  redirect(buildMypageInfoHubHref());
}
