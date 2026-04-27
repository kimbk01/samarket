import { AdminBoardGuideClient } from "@/components/admin/docs/AdminBoardGuideClient";
import { readAdminGuideMd } from "@/lib/admin-docs/readAdminGuideMd";

export const metadata = {
  title: "게시판·커뮤니티 사용 설명서",
};

export default function AdminBoardGuidePage() {
  const content = readAdminGuideMd("board");
  return <AdminBoardGuideClient content={content} />;
}
