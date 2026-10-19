import { Suspense } from "react";
import { AdminMessengerDomainRoomList } from "@/components/admin/chats/AdminMessengerDomainRoomList";

export default function AdminChatsGeneralPage() {
  return (
    <Suspense fallback={null}>
      <AdminMessengerDomainRoomList mode="general" />
    </Suspense>
  );
}
