import { Suspense } from "react";
import { DibayIntroStudioPage } from "@/components/admin/dibay-intro/DibayIntroStudioPage";

export default async function AdminIntroStudioRoute({
  params,
}: {
  params: Promise<{ introId: string }>;
}) {
  const { introId } = await params;
  return (
    <Suspense fallback={<p className="p-6 text-sm text-sam-muted">…</p>}>
      <DibayIntroStudioPage introId={introId} />
    </Suspense>
  );
}
