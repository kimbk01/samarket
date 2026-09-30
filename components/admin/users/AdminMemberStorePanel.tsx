"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminPersonStoreRow } from "@/components/admin/users/AdminTestUserDetail";
import {
  memberBusinessCreditHref,
  memberStoreOrdersByStoreHref,
  memberStorePublicHref,
} from "@/lib/admin-users/member-deep-links";
import {
  MEMBER_DETAIL_STORE_NONE_KO,
  MEMBER_DETAIL_STORE_OPERATOR_KO,
  memberDetailStoreHref,
} from "@/lib/admin-users/member-detail-presentation";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

function isActiveStore(store: AdminPersonStoreRow): boolean {
  return String(store.approval_status ?? "").trim().toLowerCase() === "approved";
}

export function AdminMemberStorePanel({ stores }: { stores: AdminPersonStoreRow[] }) {
  const { t, safeT, language } = useI18n();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const fmt = (value: string | null | undefined) => {
    if (!value) return t("admin_users_empty_placeholder");
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toLocaleString(locale) : value;
  };

  if (stores.length === 0) {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} px-4 py-8 text-center`} data-member-detail-store="none">
        <p className="text-sm font-semibold text-[#667085]">{MEMBER_DETAIL_STORE_NONE_KO}</p>
        <p className="mt-1 text-[12px] text-[#98a2b3]">등록된 매장 운영 관계가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-member-detail-store="list">
      <p className="text-[13px] font-medium text-[#344054]">
        {MEMBER_DETAIL_STORE_OPERATOR_KO}
        <span className="ml-2 text-[#667085]">{stores.length}곳</span>
      </p>
      <div className={`${ADMIN_USERS_LITE_CARD} overflow-x-auto`}>
        <table className="min-w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#eaecf0] bg-[#f8fafc] text-left text-[11px] font-semibold uppercase text-[#475467]">
              <th className="px-3 py-2">매장</th>
              <th className="px-3 py-2">매장 ID</th>
              <th className="px-3 py-2">{t("admin_users_store_col_store_status")}</th>
              <th className="px-3 py-2">관계</th>
              <th className="px-3 py-2">{t("admin_users_col_joined")}</th>
              <th className="px-3 py-2">{t("admin_users_col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => {
              const slug = String(store.slug ?? "").trim();
              const href = memberDetailStoreHref(store.id);
              return (
                <tr key={store.id} className="border-b border-[#eaecf0]">
                  <td className="px-3 py-2 font-medium text-[#101828]">
                    {store.store_name || t("admin_users_empty_placeholder")}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-[#475467]">#{store.id}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full border border-[#e4e7ec] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-semibold text-[#344054]">
                      {store.approval_status || "—"}
                      {isActiveStore(store) ? "" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#344054]">{MEMBER_DETAIL_STORE_OPERATOR_KO}</td>
                  <td className="px-3 py-2 tabular-nums text-[#475467]">{fmt(store.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-3 text-xs font-semibold text-[#2563eb]">
                      <Link href={href} data-member-store-detail-cta="1">
                        매장 상세 보기
                      </Link>
                      {slug ? (
                        <Link href={memberStorePublicHref(slug)}>
                          {safeT("admin_users_cta_store_public", { fallbackKo: "공개 매장", fallbackEn: "Public store" })}
                        </Link>
                      ) : null}
                      <Link href={memberStoreOrdersByStoreHref(store.id)}>
                        {safeT("admin_users_cc_cta_store_orders", { fallbackKo: "주문 보기", fallbackEn: "View orders" })}
                      </Link>
                      <Link href={memberBusinessCreditHref(store.store_name || slug || undefined)}>
                        {safeT("admin_users_cc_cta_business_credit", { fallbackKo: "Business Credit", fallbackEn: "Business Credit" })}
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
