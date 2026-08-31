import { NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadResolvedCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-db";
import { homeBannerBeforeRestPolicyEnabled } from "@/lib/stores/composition/stores-composition-insertion-live";
import { loadVisiblePhysicalBannerSlides } from "@/lib/stores/load-delivery-ad-physical-banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stores/home-before-rest-banners — Stage 2 HOME Banner before rest_stores. */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }
  const { rows } = await loadResolvedCompositionPolicy(sb, "home");
  const physicalEnabled = homeBannerBeforeRestPolicyEnabled(rows);
  if (!physicalEnabled) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }
  const banners = await loadVisiblePhysicalBannerSlides(sb, {
    inventoryKey: "STORES_HOME_INLINE_1",
    dbSurface: "stores_home_inline",
    physicalEnabled: true,
    capacity: 1,
  });
  return NextResponse.json({ ok: true, banners, physicalEnabled: true });
}
