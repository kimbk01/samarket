import { MoimManageReports } from "@/components/moim/manage/MoimManageReports";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageReports moimId={moimId} />;
}
