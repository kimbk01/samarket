"use client";

/**
 * DEF-60 — Admin 주문 채팅 단일 경로 `/admin/stores/orders/{orderId}/chat` (읽기 전용).
 * Data: GET /api/admin/order-chats/{orderId} (lookup-only — no room create / join / read marker).
 * 커뮤니티 메신저 관리 화면으로 보내지 않는다 (store_order 채팅은 3종 채팅 중 주문 채팅).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import type {
  AdminStoreOrderChatSenderRole,
  AdminStoreOrderChatView,
} from "@/lib/admin-delivery-orders/load-admin-store-order-chat";

const ROLE_KEY: Record<AdminStoreOrderChatSenderRole, MessageKey> = {
  buyer: "admin_r4b_chat_role_buyer",
  store: "admin_r4b_chat_role_store",
  system: "admin_r4b_chat_role_system",
  other: "admin_r4b_chat_role_other",
};

const ROLE_BUBBLE: Record<AdminStoreOrderChatSenderRole, string> = {
  buyer: "mr-auto border-sam-border bg-sam-surface",
  store: "ml-auto border-sam-primary-soft bg-sam-primary-soft",
  system: "mx-auto border-sam-border-soft bg-sam-surface-muted text-center",
  other: "mr-auto border-sam-border bg-sam-surface",
};

export function AdminStoreOrderChatViewer({ orderId }: { orderId: string }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const backHref = readAdminReturnToFromSearch(searchParams) ?? "/admin/order-chats";
  const [chat, setChat] = useState<AdminStoreOrderChatView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/order-chats/${encodeURIComponent(orderId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; chat?: AdminStoreOrderChatView } | null;
      if (!res.ok || !j?.ok || !j.chat) {
        setError({ code: res.status === 403 ? "forbidden" : j?.error || "load_failed", status: res.status });
        return;
      }
      setChat(j.chat);
    } catch {
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = (s: string) => {
    const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
    return key ? t(key) : "—";
  };
  const orderHref = `/admin/stores/orders/${encodeURIComponent(orderId)}`;

  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="delivery"
      data-admin-chat-domain="store_order"
      data-testid="admin-order-chat-viewer"
    >
      <AdminPageHeader titleKey="admin_menu_order_chats" description={t("admin_r4b_chat_desc")} backHref={backHref} />

      {loading && !chat ? (
        <AdminLoadingState ko={ko} />
      ) : error && !chat ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => void load()} />
      ) : chat ? (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <dl className="grid gap-2 sam-text-helper sm:grid-cols-3">
              <div>
                <dt className="text-sam-muted">{t("admin_r4b_chat_status")}</dt>
                <dd className="font-medium text-sam-fg">
                  <span className="font-mono">{chat.orderNo || "—"}</span> · {statusLabel(chat.orderStatus)}
                </dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_r4b_chat_store")}</dt>
                <dd className="text-sam-fg">{chat.storeName}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_r4b_chat_buyer")}</dt>
                <dd className="text-sam-fg">{chat.buyerLabel}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={orderHref} className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper text-sam-fg hover:bg-sam-surface-muted">
                {t("admin_r4b_chat_order_detail")}
              </Link>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50"
              >
                {t("admin_r4b_chat_reload")}
              </button>
            </div>
            <AdminTechDetails ko={ko}>
              orderId={chat.orderId}
              {chat.roomId ? ` · roomId=${chat.roomId}` : ""}
            </AdminTechDetails>
          </section>

          {error ? <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => void load()} /> : null}

          <section className="rounded-ui-rect border border-sam-border bg-sam-app p-3" aria-label={t("admin_r4b_chat_messages")}>
            {!chat.roomId ? (
              <AdminEmptyState ko={ko} message={t("admin_r4b_chat_no_room")} />
            ) : chat.messages.length === 0 ? (
              <AdminEmptyState ko={ko} message={t("admin_r4b_chat_empty")} />
            ) : (
              <>
                {chat.truncated ? <p className="mb-2 sam-text-xxs text-sam-muted">{t("admin_r4b_chat_truncated")}</p> : null}
                <ol className="flex flex-col gap-2">
                  {chat.messages.map((m) => (
                    <li
                      key={m.id}
                      data-chat-sender-role={m.senderRole}
                      className={`max-w-[85%] rounded-ui-rect border px-3 py-2 sam-text-helper ${ROLE_BUBBLE[m.senderRole]}`}
                    >
                      <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 sam-text-xxs text-sam-muted">
                        <span className="font-medium">
                          {t(ROLE_KEY[m.senderRole])}
                          {m.senderLabel && m.senderRole !== "system" ? ` · ${m.senderLabel}` : ""}
                        </span>
                        <span className="tabular-nums">{m.createdAt ? formatAdminDateTime(m.createdAt, language) : ""}</span>
                      </div>
                      {m.hiddenByAdmin ? (
                        <p className="italic text-sam-muted">{t("admin_r4b_chat_hidden")}</p>
                      ) : (
                        <p className="whitespace-pre-wrap text-sam-fg [overflow-wrap:anywhere]">{m.content}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
