import { IntroShowStudioPage } from "@/components/admin/intro-show/IntroShowStudioPage";

export default async function AdminIntroStudioRoute({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  return <IntroShowStudioPage showId={showId} />;
}
