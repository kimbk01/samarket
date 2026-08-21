import { MyContent } from "./MyContent";
import { loadMypageOwnerStoreGateSeedServer } from "@/lib/my/load-mypage-owner-store-gate-seed";

/**
 * `/my` — same shell as `/mypage`.
 * DO NOT: `redirect("/mypage")` RSC — Cap WebView hits React #310 / Application error.
 * Tiny owner-store gate seed — same authority as `/mypage` cold CTA.
 */
export default async function MyPage() {
  const ownerStoreGateSeed = await loadMypageOwnerStoreGateSeedServer();
  return <MyContent ownerStoreGateSeed={ownerStoreGateSeed} />;
}
