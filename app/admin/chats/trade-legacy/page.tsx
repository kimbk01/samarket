import { Suspense } from "react";
import { AdminChatListPage } from "@/components/admin/chats/AdminChatListPage";

/** 레거시 거래 기록 (설계 §3-6) — 앱 채팅방(CM)이 없는 과거 거래 채팅, 읽기 전용 · 영구 삭제는 시트 S6. */
export default function AdminChatsTradeLegacyPage() {
  return (
    <Suspense fallback={null}>
      <AdminChatListPage mode="trade_legacy" />
    </Suspense>
  );
}
