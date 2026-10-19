import { Suspense } from "react";
import { AdminCommunityMessengerPage } from "@/components/admin/community-messenger/AdminCommunityMessengerPage";

/** 강제 종료 분석 (KPI·추이·관리자별·히트맵) — 예전 `/admin/chats/messenger` 화면. */
export default function AdminChatsCallsAnalysisPage() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityMessengerPage />
    </Suspense>
  );
}
