import { MoimManageClose } from "@/components/moim/manage/MoimManageClose";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManageClose moimId={moimId} />;
}
