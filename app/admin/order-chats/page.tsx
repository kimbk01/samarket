import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminOrderChatList } from "@/components/admin/delivery-orders/AdminOrderChatList";

/**
 * 주문·채팅 관련 관리 화면으로의 허브 (404 방지 및 운영 동선 통일).
 */
export default function AdminOrderChatsHubPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <AdminPageHeader
        title="주문 · 채팅 허브"
        description="매장 주문·거래·커뮤니티 메신저는 DB·테이블이 다릅니다. 아래에서 목적에 맞는 화면으로 이동하세요."
      />

      <AdminCard title="최근 주문 채팅 (실데이터 · 최대 120건)">
        <AdminOrderChatList />
      </AdminCard>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">매장 주문 (store_orders)</h2>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            <li>
              <Link className="text-signature underline" href="/admin/store-orders">
                매장 주문(액션) — 환불 승인·목록
              </Link>
              <span className="text-sam-muted"> · </span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">?order_id=UUID</code>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/delivery-orders">
                배달·포장 주문(표·KPI)
              </Link>
            </li>
            <li>
              <span className="text-sam-fg">주문별 채팅(관리 UI): </span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">
                /admin/delivery-orders/{"{"}주문UUID{"}"}/chat
              </code>
            </li>
          </ul>
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">거래·메신저</h2>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            <li>
              <Link className="text-signature underline" href="/admin/chats/trade">
                거래 채팅 (통합/레거시)
              </Link>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/chats/messenger">
                커뮤니티 메신저 운영
              </Link>
              <span className="text-sam-muted"> · 방/사용자 검색: </span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">?room=UUID</code>
              <span className="text-sam-muted"> 또는 </span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">?q=키워드</code>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/chats">
                채팅 전체 목록
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <p className="sam-text-helper leading-relaxed text-sam-muted">
        주문 채팅 원장은 <code className="rounded bg-sam-app px-1">order_chat_*</code> 입니다. 사용자 앱은{" "}
        <code className="rounded bg-sam-app px-1">/api/order-chat/…</code>, 관리자 화면{" "}
        <code className="rounded bg-sam-app px-1">/admin/delivery-orders/{"{"}주문UUID{"}"}/chat</code> 은{" "}
        <code className="rounded bg-sam-app px-1">/api/admin/order-chat/…</code> 로 동일 DB를 봅니다. 이상 시{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        에서 <code className="rounded bg-sam-app px-1">order_id</code>를 확인하세요.
      </p>
    </div>
  );
}
