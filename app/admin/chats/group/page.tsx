import { Suspense } from "react";
import { AdminMessengerDomainRoomList } from "@/components/admin/chats/AdminMessengerDomainRoomList";

export default function AdminChatsGroupPage() {
  return (
    <Suspense fallback={null}>
      <AdminMessengerDomainRoomList mode="group" />
    </Suspense>
  );
}
