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
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function AdminMemberStorePanel({ stores }: { stores: AdminPersonStoreRow[] }) {
  const { t, safeT } = useI18n();
  const canonical = resolveCanonicalMemberStore(stores);
  const anomaly = memberStoreRelationAnomalyCount(stores) > 1;
  const fmt = (value: string | null | undefined) => {
    if (!value) return t("admin_users_empty_placeholder");
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? formatAdminManilaDateTime(value) : value;
  };

  if (!canonical) {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} px-4 py-8 text-center`} data-member-detail-store="none">
        <p className="text-sm font-semibold text-sam-muted">{MEMBER_DETAIL_STORE_NONE_KO}</p>
        <p className="mt-1 text-[12px] text-sam-meta">{MEMBER_STORE_RELATION_COPY.none_body}</p>
      </div>
    );
  }

  const slug = String(canonical.slug ?? "").trim();
  const href = memberDetailStoreHref(canonical.id);

  return (
    <div className="space-y-3" data-member-detail-store="one">
      {anomaly ? (
        <p className="rounded-ui-rect border border-sam-danger/40 bg-sam-danger-soft px-3 py-2 text-[13px] text-sam-danger">
          {MEMBER_STORE_RELATION_COPY.anomaly_multi}
        </p>
      ) : null}
      <p className="text-[13px] font-medium text-sam-fg" data-member-store-relation-label="1">
        {MEMBER_STORE_RELATION_COPY.relationship_operator}
      </p>
      <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-sam-fg" data-member-store-name="1">
              {canonical.name}
            </p>
            <p className="font-mono text-[12px] text-sam-muted" data-member-store-id="1">
              #{canonical.id}
            </p>
            <p className="text-[12px] text-sam-muted">
              {MEMBER_STORE_RELATION_COPY.store_status_label}:{" "}
              <span className="inline-flex rounded-full border border-sam-border bg-sam-surface-muted px-2 py-0.5 text-[12px] font-semibold text-sam-fg">
                {memberStoreApprovalStatusLabelKo(canonical.approvalStatus)}
              </span>
            </p>
            {canonical.connectedAt ? (
              <p className="text-[12px] tabular-nums text-sam-muted">
                {t("admin_users_col_joined")} {fmt(canonical.connectedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-sam-primary">
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
