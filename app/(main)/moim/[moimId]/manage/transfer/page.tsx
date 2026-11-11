import { MoimManageTransfer } from "@/components/moim/manage/MoimManageTransfer";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageTransfer moimId={moimId} />;
}
