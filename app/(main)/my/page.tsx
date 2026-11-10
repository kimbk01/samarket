import { MyContent } from "./MyContent";
import { loadMypageOwnerStoreGateSeedServer } from "@/lib/my/load-mypage-owner-store-gate-seed";
import { loadMypageAdminMenuSeedServer } from "@/lib/my/load-mypage-admin-menu-seed";

/**
 * `/my` — same shell as `/mypage`.
 * DO NOT: `redirect("/mypage")` RSC — Cap WebView hits React #310 / Application error.
 * Tiny owner-store gate seed — same authority as `/mypage` cold CTA.
 * Tiny admin menu seed — same `isRouteAdmin` authority as `/mypage`.
 */
export default async function MyPage() {
  const [ownerStoreGateSeed, adminMenuSeed] = await Promise.all([
    loadMypageOwnerStoreGateSeedServer(),
    loadMypageAdminMenuSeedServer(),
  ]);
  return <MyContent ownerStoreGateSeed={ownerStoreGateSeed} adminMenuSeed={adminMenuSeed} />;
}
