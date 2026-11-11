import { MoimProfileScreen } from "@/components/moim/MoimProfileScreen";

export default async function MoimProfilePage({ params }: { params: Promise<{ moimId: string }> }) {
  const { moimId } = await params;
  return <MoimProfileScreen moimId={moimId} />;
}
