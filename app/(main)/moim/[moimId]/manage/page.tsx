import { MoimManageHub } from "@/components/moim/manage/MoimManageHub";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageHub moimId={moimId} />;
}
