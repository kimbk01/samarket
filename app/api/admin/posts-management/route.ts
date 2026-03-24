import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { fetchAdminPostsManagementProducts } from "@/lib/admin-products/admin-posts-management-data";

/**
 * 게시물 관리 목록 — 서비스 롤로 posts + 카테고리 조인
 * GET /api/admin/posts-management (관리자 세션)
 */
export async function GET(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const usedServiceRole = Boolean(serviceKey);

  if (!url || !anonKey) {
    return NextResponse.json({
      products: [],
      queryError:
        "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 .env.local에 없습니다. 둘 다 필요합니다.",
      usedServiceRole: false,
    });
  }

  const anon = createClient(url, anonKey);
  const supabase = usedServiceRole
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : anon;

  const { products, queryError } = await fetchAdminPostsManagementProducts(supabase);
  return NextResponse.json({
    products,
    queryError,
    usedServiceRole,
  });
}
