import { Suspense } from "react";
import MyAdsPageClient from "./MyAdsPageClient";

/** Canonical ads management. */
export default function MypageAdsPage() {
  return (
    <Suspense fallback={null}>
      <MyAdsPageClient />
    </Suspense>
  );
}
