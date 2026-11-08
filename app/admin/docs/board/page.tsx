import { AdminBoardGuideClient } from "@/components/admin/docs/AdminBoardGuideClient";
import { readAdminGuideMd } from "@/lib/admin-docs/readAdminGuideMd";
import { adminServerText } from "@/lib/i18n/admin-server-language";

export async function generateMetadata() {
  return { title: await adminServerText("admin_docs_board_guide_title") };
}

export default function AdminBoardGuidePage() {
  const content = readAdminGuideMd("board");
  return <AdminBoardGuideClient content={content} />;
}
