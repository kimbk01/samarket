import { MoimManagePermissions } from "@/components/moim/manage/MoimManagePermissions";

type PageProps = { params: Promise<{ moimId: string }> };

export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return <MoimManagePermissions moimId={moimId} />;
}
