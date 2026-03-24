import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGuideMarkdown } from "@/components/admin/docs/AdminGuideMarkdown";
import { readAdminGuideMd } from "@/lib/admin-docs/readAdminGuideMd";

export const metadata = {
  title: "채팅 관리 사용 설명서",
};

export default function AdminChatGuidePage() {
  const content = readAdminGuideMd("chat");

  return (
    <div className="space-y-4">
      <AdminPageHeader title="채팅 관리 사용 설명서" />
      <p className="text-[13px] text-gray-600">
        게시판·커뮤니티 운영 안내는{" "}
        <Link href="/admin/docs/board" className="font-medium text-signature hover:underline">
          게시판·커뮤니티 사용 설명서
        </Link>
        에서 확인할 수 있습니다.
      </p>
      <AdminGuideMarkdown content={content} />
    </div>
  );
}
