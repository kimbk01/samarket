/**
 * 내상품 목록 (본인이 올린 글) — 서비스 롤
 * GET /api/my/posts (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";

export async function GET(_req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: rows, error } = await sbAny
    .from("posts")
    .select(
      "id, title, content, price, status, seller_listing_state, images, view_count, created_at, updated_at, user_id"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const posts = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    title: (r.title as string) ?? "",
    description: (r.content as string) ?? "",
    price: Number(r.price) ?? 0,
    status: (r.status as string) ?? "active",
    sellerListingState: (r.seller_listing_state as string) ?? undefined,
    thumbnail: Array.isArray(r.images) && (r.images as string[]).length > 0 ? (r.images as string[])[0] : "",
    images: (r.images as string[]) ?? [],
    viewCount: Number(r.view_count) ?? 0,
    likesCount: 0,
    chatCount: 0,
    isBoosted: false,
    location: "",
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
    sellerId: r.user_id as string,
    seller: { id: r.user_id, nickname: "", avatar: "", location: "", mannerTemp: 36.5 },
  }));

  return NextResponse.json({ posts });
}
