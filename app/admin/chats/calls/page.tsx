import { Suspense } from "react";
import { AdminChatCallsPage } from "@/components/admin/chats/AdminChatCallsPage";

/** 통화 기록·강제 종료 (설계 §3-3) — 진행 중 / 통화 기록 / 강제 종료 기록. */
export default function AdminChatsCallsPage() {
  return (
    <Suspense fallback={null}>
      <AdminChatCallsPage />
    </Suspense>
  );
}
