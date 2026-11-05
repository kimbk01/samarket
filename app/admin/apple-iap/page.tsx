import { Suspense } from "react";
import { AdminAppleIapReviewPage } from "@/components/admin/apple-iap/AdminAppleIapReviewPage";

export default function AppleIapReviewPage() {
  return (
    <Suspense fallback={null}>
      <AdminAppleIapReviewPage />
    </Suspense>
  );
}
