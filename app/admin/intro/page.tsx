import { Suspense } from "react";
import { IntroDocumentHub } from "@/components/admin/intro/IntroDocumentHub";

export default function AdminIntroHubPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6" data-admin-intro-hub-page="1">
      <Suspense fallback={<div className="text-sm text-sam-muted">불러오는 중…</div>}>
        <IntroDocumentHub />
      </Suspense>
    </div>
  );
}
