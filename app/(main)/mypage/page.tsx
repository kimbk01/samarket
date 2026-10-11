import { MyContent } from "../my/MyContent";
import { loadMypageOwnerStoreGateSeedServer } from "@/lib/my/load-mypage-owner-store-gate-seed";
import { loadMypageAdminMenuSeedServer } from "@/lib/my/load-mypage-admin-menu-seed";

/**
 * `/mypage` — Cold Boot / Bottom Tab Cache-First.
 * DO NOT: await full hub extras / CMS / trade counts on this route.
 * DO: tiny owner-store gate seed so cold OwnerLite/TTL empty still resolves the store menu CTA.
 * DO: tiny admin menu seed (same `isRouteAdmin` authority) so the admin row is in the first render.
 */
export default async function MypagePage() {
  const [ownerStoreGateSeed, adminMenuSeed] = await Promise.all([
    loadMypageOwnerStoreGateSeedServer(),
    loadMypageAdminMenuSeedServer(),
  ]);
  return <MyContent ownerStoreGateSeed={ownerStoreGateSeed} adminMenuSeed={adminMenuSeed} />;
}
