import { Suspense } from "react";
import { AdminChatReportQueuePage } from "@/components/admin/chats/AdminChatReportQueuePage";

/** 채팅 신고 단일 큐 (O-C10) — CM + 레거시 거래 chat_reports + reports(채팅 대상). */
export default function AdminChatsReportedPage() {
  return (
    <Suspense fallback={null}>
      <AdminChatReportQueuePage />
    </Suspense>
  );
}
