import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

/**
 * 채팅 등에서 사용하는 상품 id가 posts 테이블 id일 때,
 * 서버에서 post 1건 조회 후 Product 형태로 변환 (상품 상세 페이지용)
 */
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "@/lib/types/product";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { POST_TRADE_DETAIL_SELECT } from "@/lib/posts/post-query-select";

function imageUrlFromItem(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x.trim();
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    const u = o.url ?? o.image_url ?? o.src;
    if (typeof u === "string" && u.trim()) return u.trim();
    const sp = o.storage_path;
    if (typeof sp === "string" && /^https?:\/\//i.test(sp)) return sp.trim();
  }
  return null;
}

function toImages(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const urls: string[] = [];
    for (const x of raw) {
      const u = imageUrlFromItem(x);
      if (u) urls.push(u);
    }
    if (urls.length > 0) return urls;
    const arr = raw.filter((x): x is string => typeof x === "string");
    return arr.length > 0 ? arr : null;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const urls: string[] = [];
        for (const x of parsed) {
          const u = imageUrlFromItem(x);
          if (u) urls.push(u);
        }
        if (urls.length > 0) return urls;
        const arr = parsed.filter((x): x is string => typeof x === "string");
        return arr.length > 0 ? arr : null;
      }
    } catch {
      /* ignore */
    }
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : null;
  }
  return null;
}

function toPrice(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

const PRODUCT_FROM_POST_SELECT =
  "id, title, content, price, images, thumbnail_url, status, view_count, favorite_count, created_at, author_id, user_id, region, city";

async function getProductFromPostIdUncached(postId: string): Promise<Product | null> {
  if (!postId?.trim()) return null;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) return null;
  try {
    const sbAny = sb as SupabaseClient;

    let { data: row, error } = await sbAny
      .from(POSTS_TABLE_READ)
      .select(PRODUCT_FROM_POST_SELECT)
      .eq("id", postId.trim())
      .maybeSingle();

    if (error && /could not find|does not exist|unknown column|schema cache/i.test(String(error.message))) {
      const full = await sbAny
        .from(POSTS_TABLE_READ)
        .select(POST_TRADE_DETAIL_SELECT)
        .eq("id", postId.trim())
        .maybeSingle();
      /** `POST_TRADE_DETAIL_SELECT` 에 `author_id` 가 없을 수 있음 — 런타임은 user_id 로 보강 */
      row = full.data as typeof row;
      error = full.error;
    }

    if (error || !row) return null;

    const r = row as Record<string, unknown>;
    const images = toImages(r.images);
    const thumbnail =
      (typeof r.thumbnail_url === "string" && r.thumbnail_url.trim()
        ? r.thumbnail_url.trim()
        : images?.[0] ?? "") || "";
    const price = toPrice(r.price);
    const authorId = (r.author_id as string) ?? (r.user_id as string) ?? "";
    const status = (r.status as string) ?? "active";
    const region = (r.region as string) ?? "";
    const city = (r.city as string) ?? "";
    const barangay = (r.barangay as string) ?? "";
    const location = [region, city, barangay].filter(Boolean).join(" · ") || "—";

    let nickname = authorId.slice(0, 8);
    if (authorId) {
      /** 프로필 우선(실서비스 다수) — 행이 없을 때만 `test_users` 조회로 왕복 1회 절감 */
      const profileRes = await sbAny
        .from("profiles")
        .select("nickname, username")
        .eq("id", authorId)
        .maybeSingle();
      const profile = profileRes.data as Record<string, unknown> | null;
      if (profile) {
        nickname = (profile.nickname ?? profile.username ?? nickname) as string;
      } else {
        const testUserRes = await sbAny
          .from("test_users")
          .select("display_name, username")
          .eq("id", authorId)
          .maybeSingle();
        const testUser = testUserRes.data as Record<string, unknown> | null;
        if (testUser) {
          nickname = (testUser.display_name ?? testUser.username ?? nickname) as string;
        }
      }
    }

    const product: Product = {
      id: (r.id as string) ?? postId,
      title: (r.title as string) ?? "",
      price,
      location: typeof location === "string" ? location : "—",
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      status: status as Product["status"],
      thumbnail,
      likesCount:
        typeof r.favorite_count === "number" && Number.isFinite(r.favorite_count)
          ? r.favorite_count
          : 0,
      chatCount: 0,
      isBoosted: false,
      images: images ?? undefined,
      description: (r.content as string) ?? undefined,
      viewCount: typeof r.view_count === "number" ? r.view_count : undefined,
      seller: {
        id: authorId,
        nickname: String(nickname).trim() || authorId.slice(0, 8),
        avatar: "",
        location,
      },
      sellerId: authorId,
    };
    return product;
  } catch {
    return null;
  }
}

/** 동일 RSC 요청에서 동일 `postId` 중복 조회 방지 */
export const getProductFromPostId = cache(getProductFromPostIdUncached);
