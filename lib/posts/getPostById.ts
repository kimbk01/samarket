"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import {
  normalizePostImages,
  normalizePostMeta,
  normalizePostPrice,
} from "./post-normalize";

export { normalizePostImages, normalizePostMeta, normalizePostPrice } from "./post-normalize";

export async function getPostById(postId: string): Promise<PostWithMeta | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !postId?.trim()) return null;

  try {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId.trim())
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    const images = normalizePostImages(row.images);
    const thumbnail_url =
      typeof row.thumbnail_url === "string" && row.thumbnail_url
        ? row.thumbnail_url
        : images?.[0] ?? null;
    const author_id = (row.author_id as string) ?? (row.user_id as string);
    const category_id = (row.category_id as string) ?? (row.trade_category_id as string);
    const price = normalizePostPrice(row.price);
    const meta = normalizePostMeta(row.meta);
    const is_free_share = row.is_free_share === true || row.is_free_share === "true";

    return {
      ...row,
      author_id,
      category_id,
      images,
      thumbnail_url,
      price,
      meta: meta ?? undefined,
      is_free_share,
    } as PostWithMeta;
  } catch {
    return null;
  }
}
