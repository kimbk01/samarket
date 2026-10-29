import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * 잔여 경로 — 마이페이지 배너 상세는 편집 화면 하나로 (감사 AD-03). 미리보기·노출 전환은 편집 화면에 있다.
 */
export default async function AdminBannerDetailRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/my/banners/${encodeURIComponent(id)}/edit`);
}
