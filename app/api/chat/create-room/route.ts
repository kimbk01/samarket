/**
 * 채팅방 생성/조회 API (서비스 롤)
 * - body: { productId: string } — 구매자는 세션
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "서버 설정이 필요합니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 넣어 주세요." },
      { status: 500 }
    );
  }

  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }

  const sbAny: SupabaseClient<any> = createClient<any>(url, serviceKey, { auth: { persistSession: false } });
  const access = await assertVerifiedMemberForAction(sbAny, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  // 1) 상품 및 판매자
  const { data: postRaw, error: postErr } = await sbAny
    .from("posts")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (postErr || !postRaw) {
    return NextResponse.json({ ok: false, error: "상품을 찾을 수 없습니다." }, { status: 200 });
  }
  const row = postRaw as Record<string, unknown>;
  const sellerId = postAuthorUserId(row) ?? "";
  if (!sellerId) {
    return NextResponse.json({ ok: false, error: "상품을 찾을 수 없습니다." }, { status: 200 });
  }
  if (sellerId === userId) {
    return NextResponse.json({ ok: false, error: "내 상품에는 채팅할 수 없습니다." }, { status: 200 });
  }
  if (row.is_deleted === true) {
    return NextResponse.json({ ok: false, error: "삭제된 상품입니다." }, { status: 200 });
  }
  if (row.status === "hidden" || row.visibility === "hidden") {
    return NextResponse.json({ ok: false, error: "비공개 상품입니다." }, { status: 200 });
  }
  if (row.status === "sold") {
    return NextResponse.json({ ok: false, error: "거래완료된 상품입니다." }, { status: 200 });
  }

  // 2) 차단
  const { data: block1 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", userId)
    .eq("blocked_user_id", sellerId)
    .maybeSingle();
  const { data: block2 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", sellerId)
    .eq("blocked_user_id", userId)
    .maybeSingle();
  if (block1 || block2) {
    return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 200 });
  }

  // 3) 기존 방
  const { data: existing } = await sbAny
    .from("product_chats")
    .select("id")
    .eq("post_id", productId)
    .eq("seller_id", sellerId)
    .eq("buyer_id", userId)
    .maybeSingle();
  const existingRow = existing as { id?: string } | null;
  if (existingRow?.id) {
    return NextResponse.json({ ok: true, roomId: existingRow.id });
  }

  // 4) 새 방 생성 (서비스 롤이라 RLS 통과)
  const { data: inserted, error: insertErr } = await sbAny
    .from("product_chats")
    .insert({
      post_id: productId,
      seller_id: sellerId,
      buyer_id: userId,
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { ok: false, error: insertErr.message ?? "채팅방 생성에 실패했습니다." },
      { status: 200 }
    );
  }
  const ins = inserted as { id?: string } | null | undefined;
  return NextResponse.json({ ok: true, roomId: ins?.id ?? "" });
}
