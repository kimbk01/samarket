import { AdminReviewDetailPage } from "@/components/admin/reviews/AdminReviewDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminReviewDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminReviewDetailPage reviewId={id} />;
}
