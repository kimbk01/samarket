import { Suspense } from "react";
import { AdminMessengerDomainRoomList } from "@/components/admin/chats/AdminMessengerDomainRoomList";

/** 전체채팅 — 모든 채팅 유형 (일반 1:1 · 그룹 · 거래 · 배달 주문), `?type=` 필터 (J-AMD-4). */
export default function AdminChatsPage() {
  return (
    <Suspense fallback={null}>
      <AdminMessengerDomainRoomList mode="all" />
    </Suspense>
  );
}
