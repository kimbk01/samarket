import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DrScenarioDetailPage } from "@/components/admin/dr/DrScenarioDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DrDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader titleKey="admin_page_dr_scenario_detail" backHref="/admin/dr" />
      <DrScenarioDetailPage scenarioId={id} />
    </>
  );
}
