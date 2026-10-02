import { AdminBannerEditPage } from "@/components/admin/banners/AdminBannerEditPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminMyBannerEditRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminBannerEditPage bannerId={id} />;
}
