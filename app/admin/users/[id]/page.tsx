import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** 레거시 상세 URL → 목록 팝업으로 연결 */
export default async function AdminUserDetailRoute({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/users?detail=${encodeURIComponent(id)}`);
}
