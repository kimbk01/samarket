"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MypageStoreOrderChatMissingOrderId() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-sm text-sam-muted">
      <p>{t("route_order_id_missing")}</p>
      <Link href="/mypage/store-orders" className="mt-2 font-medium text-signature underline">
        {t("route_store_orders_back_link")}
      </Link>
    </div>
  );
}

export function MypageStoreOrderChatLoginPrompt() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-sm text-sam-muted">
      <p>{t("auth_resource_access_denied")}</p>
    </div>
  );
}

export function OwnerStoreOrderChatMissingOrderId() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-sam-fg">
      <p>{t("route_order_id_missing")}</p>
      <Link href="/stores/owner" className="font-medium text-signature underline">
        {t("owner_store_admin_hub")}
      </Link>
    </div>
  );
}

export function OwnerStoreOrderChatConfigRequired() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-sm text-sam-muted">
      {t("owner_store_server_config_required")}
    </div>
  );
}

export function OwnerStoreOrderChatLoadFailed({ error }: { error: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="text-sm text-sam-fg">
        {t("owner_store_order_chat_load_failed")} ({error})
      </p>
      <Link href="/stores/owner" className="text-sm font-medium text-signature underline">
        {t("owner_store_admin_hub")}
      </Link>
    </div>
  );
}

export function MypageStoreOrderChatOpenFailed({
  orderId,
  error,
}: {
  orderId: string;
  error?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
      <p className="text-sm text-sam-fg">
        {t("route_store_order_chat_open_failed")}
        {error ? ` (${error})` : ""}
      </p>
      <Link
        href={`/mypage/store-orders/${encodeURIComponent(orderId)}`}
        className="text-sm font-medium text-signature underline"
      >
        {t("route_store_order_detail_link")}
      </Link>
    </div>
  );
}
