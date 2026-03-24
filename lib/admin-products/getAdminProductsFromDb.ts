"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types/product";
import {
  fetchAdminPostsManagementProducts,
  type AdminPostsManagementFetchResult,
} from "@/lib/admin-products/admin-posts-management-data";

export type { AdminProductRow } from "@/lib/admin-products/admin-posts-management-data";

/**
 * 어드민 상품 목록 — posts 테이블 + 카테고리(icon_key)·신고 수 (클라이언트 Supabase)
 */
export async function getAdminProductsFromDb(): Promise<AdminPostsManagementFetchResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      products: [],
      queryError: "브라우저 Supabase 클라이언트가 없습니다. NEXT_PUBLIC_SUPABASE_URL·ANON_KEY를 확인하세요.",
    };
  }
  return fetchAdminPostsManagementProducts(supabase);
}

/**
 * 어드민 상품 상세 1건 — posts 테이블 기준
 */
export async function getAdminProductByIdFromDb(productId: string): Promise<Product | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: row, error } = await (supabase as any)
      .from("posts")
      .select("id, user_id, title, content, price, status, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, board_id")
      .eq("id", productId)
      .maybeSingle();

    if (error || !row) return null;

    const userId = row.user_id;
    let nickname = userId;
    if (userId) {
      const { data: u } = await (supabase as any)
        .from("test_users")
        .select("display_name, username")
        .eq("id", userId)
        .maybeSingle();
      if (u) nickname = (u.display_name ?? u.username ?? userId).trim() || userId;
    }

    const location = [row.region, row.city].filter(Boolean).join(" ") || "";
    const thumbnail = row.thumbnail_url ?? row.images?.[0] ?? "";
    const product: Product = {
      id: row.id,
      title: row.title,
      price: Number(row.price) ?? 0,
      location,
      createdAt: row.created_at,
      status: row.status as Product["status"],
      thumbnail,
      likesCount: row.favorite_count ?? 0,
      chatCount: row.chat_count ?? 0,
      isBoosted: false,
      sellerId: row.user_id,
      updatedAt: row.updated_at,
      description: row.content,
      viewCount: row.view_count,
      images: row.images ?? undefined,
      seller: {
        id: row.user_id,
        nickname,
        avatar: "",
        location,
      },
    };

    const { data: reportRows } = await (supabase as any)
      .from("reports")
      .select("id")
      .eq("target_type", "product")
      .eq("target_id", productId);
    if (Array.isArray(reportRows) && reportRows.length > 0) {
      product.reportCount = reportRows.length;
    }

    return product;
  } catch {
    return null;
  }
}
