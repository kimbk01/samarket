import { MoimManageRequests } from "@/components/moim/manage/MoimManageRequests";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageRequests moimId={moimId} />;
}
