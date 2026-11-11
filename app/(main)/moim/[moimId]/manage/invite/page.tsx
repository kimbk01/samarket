import { MoimManageInvite } from "@/components/moim/manage/MoimManageInvite";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageInvite moimId={moimId} />;
}
