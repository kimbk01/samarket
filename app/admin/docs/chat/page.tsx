import { AdminChatGuideClient } from "@/components/admin/docs/AdminChatGuideClient";
import { readAdminGuideMd } from "@/lib/admin-docs/readAdminGuideMd";

export const metadata = {
  title: "채팅 관리 사용 설명서",
};

export default function AdminChatGuidePage() {
  const content = readAdminGuideMd("chat");
  return <AdminChatGuideClient content={content} />;
}
