import { MoimManageMembers } from "@/components/moim/manage/MoimManageMembers";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageMembers moimId={moimId} />;
}
