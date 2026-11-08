import { AdminChatGuideClient } from "@/components/admin/docs/AdminChatGuideClient";
import { readAdminGuideMd } from "@/lib/admin-docs/readAdminGuideMd";
import { adminServerText } from "@/lib/i18n/admin-server-language";

export async function generateMetadata() {
  return { title: await adminServerText("admin_docs_chat_guide_title") };
}

export default function AdminChatGuidePage() {
  const content = readAdminGuideMd("chat");
  return <AdminChatGuideClient content={content} />;
}
