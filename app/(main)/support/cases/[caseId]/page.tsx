import { SupportCaseBootstrapClient } from "@/components/support/SupportCaseBootstrapClient";

export default async function SupportCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <SupportCaseBootstrapClient caseId={caseId} />;
}
