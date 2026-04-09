import { redirect } from "next/navigation";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

/** 설정 허브는 `/mypage?sheet=info` 통합 시트. 기존 마이페이지 링크 호환용. */
export default function LegacyMypageSettingsRedirect() {
  redirect(buildMypageInfoHubHref());
}
