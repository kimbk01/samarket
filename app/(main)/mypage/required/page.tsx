import { redirect } from "next/navigation";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

/** 3/3 위저드 폐기 — 계정·인증은 내정보 컨트롤 센터에서만 관리. */
export default function MypageRequiredFlowPage() {
  redirect(MYPAGE_MAIN_HREF);
}
