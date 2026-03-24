import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DrScenarioDetailPage } from "@/components/admin/dr/DrScenarioDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DrDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader title="DR 시나리오 상세" backHref="/admin/dr" />
      <DrScenarioDetailPage scenarioId={id} />
    </>
  );
}
