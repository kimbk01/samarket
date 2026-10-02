import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Residual path — canonical MyPage CMS edit is /admin/my/banners/[id]/edit. */
export default async function AdminBannerEditRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/my/banners/${encodeURIComponent(id)}/edit`);
}
