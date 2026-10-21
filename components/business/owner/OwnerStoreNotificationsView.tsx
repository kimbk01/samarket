"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerNotificationList } from "@/components/stores/owner/OwnerNotificationList";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";

/**
 * Canonical Owner notification inbox — `/stores/owner/notifications?storeId=`.
 * Slug path `/stores/[slug]/owner/notifications` 는 이 경로로 서버 redirect (IA-07·IA-18).
 */
export function OwnerStoreNotificationsView() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  /** IA-08 — URL 없으면 셸 선택 매장(셸이 URL 도 정규화). `list[0]` 금지. */
  const shellStoreId = useBusinessAdminStore()?.storeRow?.id?.trim() ?? "";
  const [storeId, setStoreId] = useState("");
  const [slug, setSlug] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sidQuery = searchParams.get("storeId")?.trim() || shellStoreId;
      if (!sidQuery) return;
      try {
        const { status, json } = await fetchMeStoresListDeduped();
        if (cancelled) return;
        if (status === 401) {
          setErr(t("common_login_required"));
          return;
        }
        const stores = (json as { ok?: boolean; stores?: { id: string; slug?: string | null }[] })
          ?.stores;
        const list = Array.isArray(stores) ? stores : [];
        const row = list.find((s) => s.id === sidQuery);
        const sid = row?.id ?? sidQuery;
        if (!sid) {
          setErr(t("store_not_found_short"));
          return;
        }
        setStoreId(sid);
        setSlug((row?.slug ?? "").trim());
        setErr(null);
      } catch {
        if (!cancelled) setErr(t("common_error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, shellStoreId, t]);

  if (err) return <p className="text-sm text-sam-muted">{err}</p>;
  if (!storeId) return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 pt-1">
      <OwnerNotificationList slug={slug || "owner"} storeId={storeId} />
      <Link href={buildStoreOrdersHref({ storeId })} className="text-sm text-signature underline">
        {t("store_owner_go_order_management")}
      </Link>
      <p className="text-xs text-sam-muted">
        <Link href={OwnerRoutes.notificationSettings(storeId)} className="text-signature underline">
          {t("store_owner_notif_settings_link")}
        </Link>
      </p>
    </div>
  );
}
