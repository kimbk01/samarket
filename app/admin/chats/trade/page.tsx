import { Suspense } from "react";
import { AdminChatListPage } from "@/components/admin/chats/AdminChatListPage";

export default function AdminChatsTradePage() {
  return (
    <Suspense fallback={null}>
      <AdminChatListPage mode="trade" />
    </Suspense>
  );
}
