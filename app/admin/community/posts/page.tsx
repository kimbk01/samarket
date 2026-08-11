import { Suspense } from "react";
import { AdminPostsPageContent } from "./AdminPostsPageContent";

export default function AdminCommunityPostsPage() {
  return (
    <Suspense fallback={null}>
      <AdminPostsPageContent />
    </Suspense>
  );
}
