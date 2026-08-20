import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  fetchAdminPostById,
  fetchAdminPostsManagementProducts,
} from "@/lib/admin-products/admin-posts-management-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 게시물 관리 목록 — 서비스 롤로 posts page + light enrich
 * GET /api/admin/posts-management?page=&pageSize=&status=&productId=&title=&region=
 * GET /api/admin/posts-management?id= — 1건 (detail)
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const usedServiceRole = Boolean(serviceKey);

  if (!url || !anonKey) {
    return NextResponse.json({
      products: [],
      total: 0,
      page: 1,
      pageSize: 40,
      queryError:
        "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 .env.local에 없습니다. 둘 다 필요합니다.",
      usedServiceRole: false,
    });
  }

  const anon = createClient(url, anonKey);
  const svc = tryCreateSupabaseServiceClient();
  const supabase = usedServiceRole && svc ? svc : anon;
  const sp = req.nextUrl.searchParams;
  const postId = sp.get("id")?.trim() ?? "";

  if (postId) {
    const { products, queryError } = await fetchAdminPostById(supabase, postId);
    return NextResponse.json({
      products,
      total: products.length,
      page: 1,
      pageSize: 1,
      queryError,
      usedServiceRole,
    });
  }

  const pageRaw = parseInt(sp.get("page") ?? "1", 10);
  const sizeRaw = parseInt(sp.get("pageSize") ?? "40", 10);
  const result = await fetchAdminPostsManagementProducts(supabase, {
    page: Number.isFinite(pageRaw) ? pageRaw : 1,
    pageSize: Number.isFinite(sizeRaw) ? sizeRaw : 40,
    status: sp.get("status")?.trim() || undefined,
    productId: sp.get("productId")?.trim() || undefined,
    title: sp.get("title")?.trim() || undefined,
    region: sp.get("region")?.trim() || undefined,
  });

  return NextResponse.json({
    products: result.products,
    total: result.total ?? result.products.length,
    page: result.page ?? 1,
    pageSize: result.pageSize ?? 40,
    queryError: result.queryError,
    usedServiceRole,
  });
}
