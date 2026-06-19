import { MyContent } from "../my/MyContent";
import { loadMypageServerShell } from "@/lib/my/load-mypage-server";

/** RSC shell — 프로필·주소·홈 stat seed 로 첫 페인트 전체 로딩 카드 방지 */
export default async function MypagePage() {
  const initialMyPageData = await loadMypageServerShell();
  return <MyContent initialMyPageData={initialMyPageData} />;
}
