import { MyContent } from "../my/MyContent";
import { loadMypageOwnerStoreGateSeedServer } from "@/lib/my/load-mypage-owner-store-gate-seed";

/**
 * `/mypage` — Cold Boot / Bottom Tab Cache-First.
 * DO NOT: await full hub extras / CMS / trade counts on this route.
 * DO: tiny owner-store gate seed so cold OwnerLite/TTL empty still resolves the store menu CTA.
 */
export default async function MypagePage() {
  const ownerStoreGateSeed = await loadMypageOwnerStoreGateSeedServer();
  return <MyContent ownerStoreGateSeed={ownerStoreGateSeed} />;
}
