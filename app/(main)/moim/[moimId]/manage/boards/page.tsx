import { MoimManageBoards } from "@/components/moim/manage/MoimManageBoards";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageBoards moimId={moimId} />;
}
