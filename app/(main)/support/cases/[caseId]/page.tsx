import { SupportCaseConversationClient } from "@/components/support/SupportCaseConversationClient";

export default async function SupportCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <SupportCaseConversationClient caseId={caseId} />;
}
