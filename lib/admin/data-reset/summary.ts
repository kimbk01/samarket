import type { SupabaseClient } from "@supabase/supabase-js";
import { countTable } from "@/lib/admin/data-reset/count-helpers";
import type { DataResetDomainSummaryRow } from "@/lib/admin/data-reset/types";

export async function loadDataResetDomainSummaries(
  sb: SupabaseClient
): Promise<{ rows: DataResetDomainSummaryRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  const take = async (table: string) => {
    const r = await countTable(sb, table);
    if (r.warning) warnings.push(r.warning);
    return r.n;
  };

  const communityPosts = await take("community_posts");
  const communityComments = await take("community_comments");
  const marketPosts = await take("posts");
  const products = await take("store_products");
  const stores = await take("stores");
  const rooms = await take("community_messenger_rooms");
  const friends = await take("user_social_relations");
  const profiles = await take("profiles");
  const point = await take("point_ledger");
  const cash = await take("business_cash_ledger");
  const gift = await take("gift_certificate_instances");

  const rows: DataResetDomainSummaryRow[] = [
    {
      domain: "community",
      labelKo: "커뮤니티",
      labelEn: "Community",
      status: "ok",
      primaryCount: communityPosts,
      detailCounts: { posts: communityPosts, comments: communityComments },
      executeDefault: "allowed_gated",
    },
    {
      domain: "market",
      labelKo: "거래",
      labelEn: "Market",
      status: "ok",
      primaryCount: marketPosts,
      detailCounts: { listings: marketPosts },
      executeDefault: "allowed_gated",
    },
    {
      domain: "delivery",
      labelKo: "배달/매장",
      labelEn: "Delivery / Stores",
      status: "partial",
      primaryCount: products,
      detailCounts: { products, stores },
      executeDefault: "allowed_gated",
    },
    {
      domain: "chat",
      labelKo: "채팅",
      labelEn: "Chat",
      status: "ok",
      primaryCount: rooms,
      detailCounts: { rooms },
      executeDefault: "allowed_gated",
    },
    {
      domain: "friend",
      labelKo: "친구관계",
      labelEn: "Friends",
      status: "ok",
      primaryCount: friends,
      detailCounts: { relations: friends },
      executeDefault: "allowed_gated",
    },
    {
      domain: "member",
      labelKo: "회원",
      labelEn: "Members",
      status: "partial",
      primaryCount: profiles,
      detailCounts: { profiles },
      executeDefault: "allowed_gated",
    },
    {
      domain: "finance",
      labelKo: "재무",
      labelEn: "Finance",
      status: "protected",
      primaryCount: point + cash + gift,
      detailCounts: { point_ledger: point, business_cash_ledger: cash, gift_instances: gift },
      executeDefault: "preview_only",
    },
  ];

  return { rows, warnings };
}
