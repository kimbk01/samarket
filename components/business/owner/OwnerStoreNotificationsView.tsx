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
import { MYPAGE_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

const FOOTER_BUTTON_CLASS =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface";

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
    <div className={`mx-auto w-full min-w-0 ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} space-y-4 px-1 pt-1`}>
      <OwnerNotificationList slug={slug || "owner"} storeId={storeId} />
      {/* 하단 이동 버튼 한 줄 — 설정 링크 1회 (목록 하단 중복 제거) · 「전체 알림」 = 회원 알림센터 */}
      <div className="flex flex-wrap gap-2 pb-2">
        <Link href={buildStoreOrdersHref({ storeId })} className={FOOTER_BUTTON_CLASS}>
          {t("store_owner_go_order_management")}
        </Link>
        <Link href={OwnerRoutes.notificationSettings(storeId)} className={FOOTER_BUTTON_CLASS}>
          {t("store_owner_notif_settings_link")}
        </Link>
        <Link href="/notifications" className={FOOTER_BUTTON_CLASS}>
          {t("store_owner_notif_all_link")}
        </Link>
      </div>
    </div>
  );
}
