import { redirect } from "next/navigation";

/** 앱 업데이트 v2 (D-V0) — 업데이트 소식 = 자동 업데이트 내역 페이지. */
export default function CustomerCenterUpdateBoardPage() {
  redirect("/mypage/app-updates");
}
