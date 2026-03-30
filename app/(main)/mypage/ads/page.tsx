import { redirect } from "next/navigation";

/** 광고 관리 화면은 `/my/ads`로 통합. 기존 마이페이지 링크 호환용. */
export default function LegacyMypageAdsRedirect() {
  redirect("/my/ads");
}
