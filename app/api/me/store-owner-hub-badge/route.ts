/**
 * 매장 오너 허브 배지: 채팅 미읽음 + 허브 매장 주문(접수·환불) + 미답변 문의.
 * 클라이언트는 orderAttention+inquiryAttention을 「매장」탭 뱃지에 쓰고, storeDeepLink로 탭 진입 시 이동.
 * GET /api/me/store-owner-hub-badge — 비로그인 시 total 0
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { countPendingAcceptForStore } from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { countOpenStoreInquiriesForStore } from "@/lib/stores/count-open-store-inquiries";
import { computeUserChatUnreadParts, sumUserChatUnread } from "@/lib/chat/user-chat-unread-parts";

export const dynamic = "force-dynamic";

type SalesPerm = { allowed_to_sell: boolean; sales_status: string };

function computeCanSell(sales: SalesPerm | null | undefined): boolean {
  return !!sales && sales.allowed_to_sell === true && sales.sales_status === "approved";
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({
      ok: true,
      total: 0,
      chatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storeDeepLink: null,
    });
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      total: 0,
      chatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storeDeepLink: null,
    });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const storesSb = tryGetSupabaseForStores();

  const [unreadParts, storeListRes] = await Promise.all([
    computeUserChatUnreadParts(sbAny, userId),
    storesSb
      ? storesSb
          .from("stores")
          .select("id, slug, approval_status, is_visible")
          .eq("owner_user_id", userId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null as unknown, error: { message: "no_stores_sb" } }),
  ]);

  const chatUnread = sumUserChatUnread(unreadParts);

  let orderAttention = 0;
  let inquiryAttention = 0;
  let storeDeepLink: string | null = null;
  if (storesSb && !storeListRes.error && Array.isArray(storeListRes.data) && storeListRes.data.length) {
    const storeRows = storeListRes.data;
    const ids = (storeRows as { id: string }[]).map((s) => s.id);
    const { data: perms } = await storesSb
      .from("store_sales_permissions")
      .select("store_id, allowed_to_sell, sales_status")
      .in("store_id", ids);
    const permByStore = new Map(
      (perms ?? []).map((p: { store_id: string; allowed_to_sell?: boolean; sales_status?: string }) => [
        p.store_id,
        { allowed_to_sell: !!p.allowed_to_sell, sales_status: String(p.sales_status ?? "") },
      ])
    );
    const hubStore = (
      storeRows as { id: string; slug?: string | null; approval_status?: string; is_visible?: boolean }[]
    ).find((s) => {
      const sales = permByStore.get(s.id);
      return (
        String(s.approval_status) === "approved" &&
        s.is_visible === true &&
        computeCanSell(sales)
      );
    });
    if (hubStore) {
      const [refund, pending, openInq] = await Promise.all([
        countRefundRequestedForStore(storesSb, hubStore.id),
        countPendingAcceptForStore(storesSb, hubStore.id),
        countOpenStoreInquiriesForStore(storesSb, hubStore.id),
      ]);
      orderAttention = Math.max(0, refund) + Math.max(0, pending);
      inquiryAttention = Math.max(0, openInq);
      if (inquiryAttention > 0) {
        storeDeepLink = `/my/business/inquiries?storeId=${encodeURIComponent(hubStore.id)}`;
      } else if (orderAttention > 0) {
        storeDeepLink = "/my/business/store-orders";
      }
    }
  }

  const total = chatUnread + orderAttention + inquiryAttention;
  return NextResponse.json({
    ok: true,
    total,
    chatUnread,
    orderAttention,
    inquiryAttention,
    storeDeepLink,
  });
}
