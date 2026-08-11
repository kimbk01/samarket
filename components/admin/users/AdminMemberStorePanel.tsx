"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminPersonStoreRow } from "@/components/admin/users/AdminTestUserDetail";
import {
  memberBusinessCreditHref,
  memberStoreOrdersByStoreHref,
  memberStoresAdminHref,
} from "@/lib/admin-users/member-deep-links";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

function isActiveStore(store: AdminPersonStoreRow): boolean {
  return String(store.approval_status ?? "").trim().toLowerCase() === "approved";
}

export function AdminMemberStorePanel({ stores }: { stores: AdminPersonStoreRow[] }) {
  const { t, safeT, language } = useI18n();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const active = stores.filter(isActiveStore).length;
  const inactive = stores.length - active;
  const fmt = (value: string | null | undefined) => {
    if (!value) return t("admin_users_empty_placeholder");
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toLocaleString(locale) : value;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${ADMIN_USERS_LITE_CARD} p-4`}>
          <p className="text-xs font-medium text-[#667085]">{t("admin_users_cc_overview_stores")}</p>
          <p className="mt-1 text-sm font-semibold text-[#101828]">{stores.length}</p>
        </div>
        <div className={`${ADMIN_USERS_LITE_CARD} p-4`}>
          <p className="text-xs font-medium text-[#667085]">
            {safeT("admin_users_cc_summary_stores_active", { fallbackKo: "활성", fallbackEn: "Active" })}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#101828]">{active}</p>
        </div>
        <div className={`${ADMIN_USERS_LITE_CARD} p-4`}>
          <p className="text-xs font-medium text-[#667085]">
            {safeT("admin_users_cc_summary_stores_inactive", { fallbackKo: "중지/비활성", fallbackEn: "Inactive" })}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#101828]">{inactive}</p>
        </div>
      </div>
      <div className={`${ADMIN_USERS_LITE_CARD} divide-y divide-[#eaecf0]`}>
        {stores.map((store) => (
          <div key={store.id} className="space-y-1 px-4 py-3">
            <p className="text-sm font-semibold text-[#101828]">{store.store_name || store.id}</p>
            <p className="text-xs text-[#667085]">
              {store.id} · {store.approval_status || "—"} · {fmt(store.created_at)}
            </p>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-[#2563eb]">
              <Link href={memberStoresAdminHref()}>
                {safeT("admin_users_cc_cta_store_admin", { fallbackKo: "매장 Admin 관리", fallbackEn: "Store admin" })}
              </Link>
              <Link href={memberStoreOrdersByStoreHref(store.id)}>
                {safeT("admin_users_cc_cta_store_orders", { fallbackKo: "주문 보기", fallbackEn: "View orders" })}
              </Link>
              <Link href={memberBusinessCreditHref()}>
                {safeT("admin_users_cc_cta_business_credit", { fallbackKo: "Business Credit 보기", fallbackEn: "Business Credit" })}
              </Link>
            </div>
          </div>
        ))}
        {stores.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#667085]">
            {safeT("admin_users_cc_empty", { fallbackKo: "항목이 없습니다.", fallbackEn: "No items." })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
