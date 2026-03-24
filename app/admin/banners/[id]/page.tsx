import { AdminBannerDetailPage } from "@/components/admin/banners/AdminBannerDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBannerDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminBannerDetailPage bannerId={id} />;
}
