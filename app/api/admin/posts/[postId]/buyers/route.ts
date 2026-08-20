import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/posts/[postId]/buyers
 * Lightweight: product_chats buyers for this post only (no messages).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { postId: raw } = await params;
  const postId = typeof raw === "string" ? raw.trim() : "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const { data, error } = await sb
    .from("product_chats")
    .select("id, buyer_id, seller_id, trade_flow_status, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const buyers = (Array.isArray(data) ? data : [])
    .map((r: { id?: string; buyer_id?: string | null; trade_flow_status?: string | null }) => {
      const buyerId = typeof r.buyer_id === "string" ? r.buyer_id.trim() : "";
      if (!buyerId) return null;
      return {
        productChatId: r.id ?? "",
        buyerId,
        tradeFlowStatus: r.trade_flow_status ?? null,
      };
    })
    .filter(Boolean);

  const uniqueBuyerIds = [...new Set(buyers.map((b) => (b as { buyerId: string }).buyerId))];

  return NextResponse.json({
    ok: true,
    buyers,
    uniqueBuyerIds,
  });
}
