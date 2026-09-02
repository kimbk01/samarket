import { OwnedGiftInstanceSupportShell } from "@/components/support/OwnedGiftInstanceSupportShell";

export default async function OwnedGiftInstancePage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  return <OwnedGiftInstanceSupportShell instanceId={instanceId} />;
}
