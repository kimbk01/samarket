import { Suspense } from "react";
import { IntroStudioPage } from "@/components/admin/intro/IntroStudioPage";

type Props = { params: Promise<{ documentId: string }> };

export default async function AdminIntroDocumentPage({ params }: Props) {
  const { documentId } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-sam-muted">불러오는 중…</div>}>
      <IntroStudioPage documentId={documentId} />
    </Suspense>
  );
}
