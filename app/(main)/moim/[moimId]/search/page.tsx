import { MoimSearchInMoimScreen } from "@/components/moim/MoimSearchInMoimScreen";

export default async function MoimSearchInMoimPage({ params }: { params: Promise<{ moimId: string }> }) {
  const { moimId } = await params;
  return <MoimSearchInMoimScreen moimId={moimId} />;
}
