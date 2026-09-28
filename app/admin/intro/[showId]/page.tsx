import { OpeningStudio } from "@/components/admin/opening-show/OpeningStudio";

export default async function AdminOpeningStudioRoute({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  return <OpeningStudio showId={showId} />;
}
