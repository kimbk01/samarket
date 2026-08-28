import { OwnedGiftInstanceDetailView } from "@/components/gift-certificate/OwnedGiftInstanceDetailView";

export default async function OwnedGiftInstancePage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  return <OwnedGiftInstanceDetailView instanceId={instanceId} />;
}
