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
  memberDetailStoreHref,
} from "@/lib/admin-users/member-detail-presentation";
import {
  MEMBER_STORE_RELATION_COPY,
  memberStoreApprovalStatusLabelKo,
  memberStoreRelationAnomalyCount,
  resolveCanonicalMemberStore,
} from "@/lib/admin-users/member-store-relation-ssot";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

export function AdminMemberStorePanel({ stores }: { stores: AdminPersonStoreRow[] }) {
  const { t, safeT, language } = useI18n();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const canonical = resolveCanonicalMemberStore(stores);
  const anomaly = memberStoreRelationAnomalyCount(stores) > 1;
  const fmt = (value: string | null | undefined) => {
    if (!value) return t("admin_users_empty_placeholder");
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toLocaleString(locale) : value;
  };

  if (!canonical) {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} px-4 py-8 text-center`} data-member-detail-store="none">
        <p className="text-sm font-semibold text-[#667085]">{MEMBER_DETAIL_STORE_NONE_KO}</p>
        <p className="mt-1 text-[12px] text-[#98a2b3]">{MEMBER_STORE_RELATION_COPY.none_body}</p>
      </div>
    );
  }

  const slug = String(canonical.slug ?? "").trim();
  const href = memberDetailStoreHref(canonical.id);

  return (
    <div className="space-y-3" data-member-detail-store="one">
      {anomaly ? (
        <p className="rounded-ui-rect border border-[#fda29b] bg-[#fffbfa] px-3 py-2 text-[13px] text-[#b42318]">
          {MEMBER_STORE_RELATION_COPY.anomaly_multi}
        </p>
      ) : null}
      <p className="text-[13px] font-medium text-[#344054]" data-member-store-relation-label="1">
        {MEMBER_STORE_RELATION_COPY.relationship_operator}
      </p>
      <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-[#101828]" data-member-store-name="1">
              {canonical.name}
            </p>
            <p className="font-mono text-[12px] text-[#475467]" data-member-store-id="1">
              #{canonical.id}
            </p>
            <p className="text-[12px] text-[#475467]">
              {MEMBER_STORE_RELATION_COPY.store_status}:{" "}
              <span className="inline-flex rounded-full border border-[#e4e7ec] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-semibold text-[#344054]">
                {memberStoreApprovalStatusLabelKo(canonical.approvalStatus)}
              </span>
            </p>
            {canonical.connectedAt ? (
              <p className="text-[12px] tabular-nums text-[#475467]">
                {t("admin_users_col_joined")} {fmt(canonical.connectedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-[#2563eb]">
            <Link href={href} data-member-store-detail-cta="1" data-member-cta-cap="CAP-STORE-VIEW">
              {MEMBER_STORE_RELATION_COPY.view_store}
            </Link>
            {slug ? (
              <Link href={memberStorePublicHref(slug)}>
                {safeT("admin_users_cta_store_public", { fallbackKo: "공개 매장", fallbackEn: "Public store" })}
              </Link>
            ) : null}
            <Link href={memberStoreOrdersByStoreHref(canonical.id)}>
              {safeT("admin_users_cc_cta_store_orders", { fallbackKo: "주문 보기", fallbackEn: "View orders" })}
            </Link>
            <Link href={memberBusinessCreditHref(canonical.name || slug || undefined)}>
              {safeT("admin_users_cc_cta_business_credit", { fallbackKo: "Business Credit", fallbackEn: "Business Credit" })}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
