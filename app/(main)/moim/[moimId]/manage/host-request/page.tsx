import { MoimManageHostRequest } from "@/components/moim/manage/MoimManageHostRequest";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageHostRequest moimId={moimId} />;
}
