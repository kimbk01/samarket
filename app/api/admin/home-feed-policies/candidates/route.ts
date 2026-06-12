import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchAdminPostsManagementProducts } from "@/lib/admin-products/admin-posts-management-data";
import { getCandidatesFromProducts } from "@/lib/exposure/exposure-candidates-from-products";
import type { FeedCandidate } from "@/lib/types/home-feed";
import { computeExposureScore } from "@/lib/exposure/exposure-score-utils";
import { getDefaultExposureScorePolicyBySurface } from "@/lib/exposure/exposure-score-policy-defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: true, candidates: [] as FeedCandidate[] });

  const { products } = await fetchAdminPostsManagementProducts(sb);
  const exposureCandidates = getCandidatesFromProducts(products, []);
  const policy = getDefaultExposureScorePolicyBySurface("home");

  const candidates: FeedCandidate[] = exposureCandidates.map((c) => {
    const product = products.find((p) => p.id === c.id);
    const sourceTags: string[] = [];
    if (c.memberType === "premium") sourceTags.push("premium");
    if (c.isBusinessItem) sourceTags.push("business");
    if (c.adPromotionStatus === "active") sourceTags.push("ad");
    if (c.pointPromotionStatus === "active") sourceTags.push("point_promo");
    if (c.shopFeaturedStatus === "active") sourceTags.push("shop_featured");
    if (c.bumpedAt) sourceTags.push("bumped");

    let exposureScore: number | undefined;
    if (policy) {
      exposureScore = computeExposureScore(c, policy, "home", null).finalScore;
    }

    return {
      id: c.id,
      title: c.title,
      sellerId: c.sellerId,
      sellerNickname: c.sellerNickname,
      memberType: c.memberType,
      businessProfileId: c.businessProfileId,
      isBusinessItem: c.isBusinessItem,
      status: c.status,
      category: product?.category ?? "",
      price: c.price,
      thumbnail: product?.thumbnail ?? "",
      createdAt: c.createdAt,
      bumpedAt: c.bumpedAt,
      region: c.region,
      city: c.city,
      barangay: c.barangay,
      distance: c.distance,
      likesCount: c.likesCount,
      chatCount: c.chatCount,
      viewCount: c.viewCount,
      adPromotionStatus: c.adPromotionStatus,
      pointPromotionStatus: c.pointPromotionStatus,
      shopFeaturedStatus: c.shopFeaturedStatus,
      exposureScore,
      sourceTags,
    };
  });

  return NextResponse.json({ ok: true, candidates });
}
