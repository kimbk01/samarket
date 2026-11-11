import { MoimManageInfo } from "@/components/moim/manage/MoimManageInfo";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageInfo moimId={moimId} />;
}
