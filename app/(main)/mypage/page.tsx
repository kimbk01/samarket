import { loadMypageServer } from "@/lib/my/load-mypage-server";
import { MyContent } from "../my/MyContent";

export const dynamic = "force-dynamic";

export default async function MypagePage() {
  const initialMyPageData = await loadMypageServer();
  return <MyContent initialMyPageData={initialMyPageData} />;
}
