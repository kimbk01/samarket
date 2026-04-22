import { Suspense } from "react";
import { loadMypageServer } from "@/lib/my/load-mypage-server";
import { MyContent } from "../my/MyContent";
import { MainFormRouteLoading } from "@/components/layout/MainRouteLoading";

export const dynamic = "force-dynamic";

async function MypageServerBody() {
  const initialMyPageData = await loadMypageServer();
  return <MyContent initialMyPageData={initialMyPageData} />;
}

/**
 * 데이터 페치는 Suspense **안쪽** async 컴포넌트에서만 await — 전환 시 상위 `loading`·fallback 이 즉시 뜬다.
 */
export default function MypagePage() {
  return (
    <Suspense fallback={<MainFormRouteLoading />}>
      <MypageServerBody />
    </Suspense>
  );
}
