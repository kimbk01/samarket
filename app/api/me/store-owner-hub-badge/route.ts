/**
 * 배달 입점(스토어) 오너 허브 배지: 소셜 채팅 미읽음 + 배달 주문(접수·환불) + 미답변 문의 + 배달채팅 미읽음.
 * `chatUnread` = 거래채팅(`/chats`·trade segment) — 행 뱃지 합과 맞춤.
 * `philifeChatUnread` = 커뮤니티·일반 DM 등(커뮤니티 계열 참가자 미읽음) — 「커뮤니티」탭 뱃지.
 * `socialChatUnread` = 위 둘의 합(알림·전체 합계용). `storesTabAttention`은 「배달」탭.
 * GET /api/me/store-owner-hub-badge — 비로그인 시 total 0
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { countPendingAcceptForStore } from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { countOpenStoreInquiriesForStore } from "@/lib/stores/count-open-store-inquiries";
import {
  getCachedUserChatUnreadParts,
  sumSocialChatUnread,
  sumTradeChatUnread,
} from "@/lib/chat/user-chat-unread-parts";
import { getCachedOwnerHubBadge } from "@/lib/chats/owner-hub-badge-cache";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import { countOwnerOrderChatUnread } from "@/lib/order-chat/service";

export const dynamic = "force-dynamic";

type SalesPerm = { allowed_to_sell: boolean; sales_status: string };

function computeCanSell(sales: SalesPerm | null | undefined): boolean {
  return !!sales && sales.allowed_to_sell === true && sales.sales_status === "approved";
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[store-owner-hub-badge] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정");
    }
    return NextResponse.json({
      ok: true,
      degraded: true,
      total: 0,
      chatUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storesTabAttention: 0,
      storeDeepLink: null,
    });
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      total: 0,
      chatUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storesTabAttention: 0,
      storeDeepLink: null,
    });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const storesSb = tryGetSupabaseForStores();

  const payload = await getCachedOwnerHubBadge(userId, async () => {
    const [unreadParts, storeListRes] = await Promise.all([
      getCachedUserChatUnreadParts(sbAny, userId),
      storesSb
        ? storesSb
            .from("stores")
            .select("id, slug, approval_status, is_visible")
            .eq("owner_user_id", userId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: null as unknown, error: { message: "no_stores_sb" } }),
    ]);

    const [socialChatUnread, tradeChatUnread, philifeChatUnread, storeOrderChatUnread] = await Promise.all([
      Promise.resolve(sumSocialChatUnread(unreadParts)),
      Promise.resolve(sumTradeChatUnread(unreadParts)),
      Promise.resolve(Math.max(0, unreadParts.communityParticipantUnread)),
      countOwnerOrderChatUnread(storesSb as any, userId).catch(() => 0),
    ]);
    const chatUnread = tradeChatUnread;

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
          storeDeepLink = buildStoreOrdersHref({ storeId: hubStore.id });
        } else if (storeOrderChatUnread > 0) {
          storeDeepLink = SAMARKET_ROUTES.orders.storeOrders;
        }
      }
    }
    if (!storeDeepLink && storeOrderChatUnread > 0) {
      storeDeepLink = SAMARKET_ROUTES.orders.storeOrders;
    }

    const storesTabAttention =
      Math.max(0, orderAttention) + Math.max(0, inquiryAttention) + storeOrderChatUnread;
    const total = socialChatUnread + storesTabAttention;
    return {
      ok: true as const,
      total,
      chatUnread,
      philifeChatUnread,
      socialChatUnread,
      storeOrderChatUnread,
      orderAttention,
      inquiryAttention,
      storesTabAttention,
      storeDeepLink,
    };
  });

  return NextResponse.json(payload);
}
