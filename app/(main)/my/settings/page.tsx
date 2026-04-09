import { redirect } from "next/navigation";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

/** 설정 목록은 `/mypage?sheet=info` 통합 시트로 이동 (하위 상세 경로는 유지). */
export default function MySettingsPage() {
  redirect(buildMypageInfoHubHref());
}
