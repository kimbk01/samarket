import { Suspense } from "react";
import { loadMypageServer } from "@/lib/my/load-mypage-server";
import { MyContent } from "../my/MyContent";

export const dynamic = "force-dynamic";

export default async function MypagePage() {
  const initialMyPageData = await loadMypageServer();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background">
          <div className="px-4 py-16 text-center text-[14px] text-[var(--text-muted)]">로딩 중…</div>
        </div>
      }
    >
      <MyContent initialMyPageData={initialMyPageData} />
    </Suspense>
  );
}
