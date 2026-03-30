import { redirect } from "next/navigation";

/** 포인트 운영 화면은 `/my/points`로 통합. 기존 마이페이지 링크 호환용. */
export default function LegacyMypagePointsRedirect() {
  redirect("/my/points");
}
