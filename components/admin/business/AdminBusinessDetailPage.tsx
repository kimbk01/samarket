"use client";

import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useState } from "react";
import type { BusinessProfileLog, BusinessProfileLogActionType } from "@/lib/types/business";
import type {
  BusinessCcDeliverySnapshot,
  BusinessCcFeeSnapshot,
  BusinessCcOwner,
  BusinessCcSalesPermission,
  BusinessCcStats,
} from "@/lib/admin-business/load-business-control-center-detail";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminStoreReviewPanel } from "@/components/admin/stores/AdminStoreReviewPanel";
import { AdminStoreReviewTheme } from "@/components/admin/stores/admin-store-review-ui";
import { AdminBusinessLogList } from "./AdminBusinessLogList";
import {
  AdminBusinessCcDeliveryCard,
  AdminBusinessCcFeeCard,
  AdminBusinessCcLinks,
  AdminBusinessCcSummary,
} from "./AdminBusinessCcPanels";
import {
  AdminBusinessCcContactEditor,
  AdminBusinessCcDeliveryOverrideEditor,
  AdminBusinessCcFeeOverrideEditor,
  AdminBusinessCcTaxonomyEditor,
} from "./AdminBusinessCcManageEditors";

const SENSITIVE_ACTIONS = new Set([
  "approve_store",
  "reject_store",
  "request_revision",
  "suspend_store",
  "resume_store",
  "approve_sales",
  "reject_sales",
  "suspend_sales",
  "set_store_visible",
  "set_owner_identity_editable",
  "set_store_name",
  "set_store_taxonomy",
  "set_store_contact",
  "set_business_hours",
  "set_delivery_flags",
]);

function mapAuditAction(action: string): BusinessProfileLogActionType {
  const a = action.toLowerCase();
  if (a.includes("approve")) return "approve";
  if (a.includes("reject")) return "reject";
  if (a.includes("suspend") || a.includes("pause")) return "pause";
  if (a.includes("resume")) return "resume";
  if (a.includes("apply")) return "apply";
  return "update_profile";
}

function toReviewRow(
  store: Record<string, unknown>,
  owner: BusinessCcOwner
): AdminStoreReviewRow {
  return {
    id: String(store.id ?? ""),
    store_name: String(store.store_name ?? ""),
    slug: String(store.slug ?? ""),
    owner_user_id: owner.ownerUserId,
    applicant_nickname:
      (typeof store.applicant_nickname === "string" && store.applicant_nickname.trim()) ||
      owner.displayLabel,
    owner_username: owner.username,
    owner_handle: owner.handle,
    approval_status: String(store.approval_status ?? ""),
    is_visible: Boolean(store.is_visible),
    business_type:
      typeof store.business_type === "string" ? store.business_type : null,
    store_category_id:
      typeof store.store_category_id === "string" ? store.store_category_id : null,
    store_topic_id:
      typeof store.store_topic_id === "string" ? store.store_topic_id : null,
    owner_can_edit_store_identity: Boolean(store.owner_can_edit_store_identity),
    store_categories: store.store_categories as AdminStoreReviewRow["store_categories"],
    store_topics: store.store_topics as AdminStoreReviewRow["store_topics"],
    description: typeof store.description === "string" ? store.description : null,
    application_request_note:
      typeof store.application_request_note === "string"
        ? store.application_request_note
        : null,
    application_address_book:
      (store.application_address_book as AdminStoreReviewRow["application_address_book"]) ??
      null,
    kakao_id: typeof store.kakao_id === "string" ? store.kakao_id : null,
    phone: typeof store.phone === "string" ? store.phone : null,
    email: typeof store.email === "string" ? store.email : null,
    website_url: typeof store.website_url === "string" ? store.website_url : null,
    region: typeof store.region === "string" ? store.region : null,
    city: typeof store.city === "string" ? store.city : null,
    district: typeof store.district === "string" ? store.district : null,
    address_line1: typeof store.address_line1 === "string" ? store.address_line1 : null,
    address_line2: typeof store.address_line2 === "string" ? store.address_line2 : null,
    lat: typeof store.lat === "number" ? store.lat : null,
    lng: typeof store.lng === "number" ? store.lng : null,
    profile_image_url:
      typeof store.profile_image_url === "string" ? store.profile_image_url : null,
    created_at: String(store.created_at ?? ""),
    updated_at: typeof store.updated_at === "string" ? store.updated_at : null,
    approved_at: typeof store.approved_at === "string" ? store.approved_at : null,
    rejected_reason:
      typeof store.rejected_reason === "string" ? store.rejected_reason : null,
    revision_note: typeof store.revision_note === "string" ? store.revision_note : null,
    suspended_reason:
      typeof store.suspended_reason === "string" ? store.suspended_reason : null,
  };
}

interface AdminBusinessDetailPageProps {
  profileId: string;
}

type CcPayload = {
  store: AdminStoreReviewRow;
  owner: BusinessCcOwner;
  sales: BusinessCcSalesPermission;
  stats: BusinessCcStats;
  fee: BusinessCcFeeSnapshot;
  delivery: BusinessCcDeliverySnapshot;
  logs: BusinessProfileLog[];
  adminMemo: string;
};

export function AdminBusinessDetailPage({ profileId }: AdminBusinessDetailPageProps) {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const [payload, setPayload] = useState<CcPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPayload(null);
    setMemoInput("");
    void fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          store?: Record<string, unknown>;
          owner?: BusinessCcOwner;
          ownerNickname?: string;
          salesPermission?: BusinessCcSalesPermission;
          stats?: BusinessCcStats;
          fee?: BusinessCcFeeSnapshot;
          delivery?: BusinessCcDeliverySnapshot;
          logs?: Array<{
            id: string;
            actionType: string;
            adminId: string;
            note: string;
            createdAt: string;
          }>;
        }) => {
          if (cancelled) return;
          if (!j.ok || !j.store) {
            setPayload(null);
            return;
          }
          const owner: BusinessCcOwner = j.owner ?? {
            ownerUserId: String(j.store.owner_user_id ?? ""),
            displayLabel: String(j.ownerNickname ?? ""),
            username: null,
            handle: null,
          };
          const reviewRow = toReviewRow(j.store, owner);
          const memo =
            typeof j.store.admin_internal_memo === "string"
              ? j.store.admin_internal_memo
              : "";
          setMemoInput(memo);
          setPayload({
            store: reviewRow,
            owner,
            sales: j.salesPermission ?? null,
            stats: j.stats ?? { productCount: 0, reviewCount: 0 },
            fee: j.fee ?? {
              scope: "missing_policy",
              policyId: null,
              policyName: "",
              feePercent: 0,
              fixedFee: 0,
              deliveryFeeMode: "",
              deliveryFeePercent: 0,
              missing: true,
              storeOverridePolicyId: null,
              storeOverrideFeePercent: null,
            },
            delivery: j.delivery ?? {
              deliveryAvailable: null,
              pickupAvailable: null,
              isOpen: null,
              lat: null,
              lng: null,
              distancePolicyEnabled: false,
              applies: false,
              maxKm: null,
              policySource: "off",
              storeOverrideMode: null,
              storeOverrideMaxKm: null,
            },
            logs: (j.logs ?? []).map((log) => ({
              id: log.id,
              businessProfileId: profileId,
              actionType: mapAuditAction(log.actionType),
              adminId: log.adminId,
              adminNickname: log.adminId.slice(0, 8) || "—",
              note: log.note,
              createdAt: log.createdAt,
            })),
            adminMemo: memo,
          });
        }
      )
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, refresh]);

  const runStoreAction = async (
    action: string,
    body?: { reason?: string; enabled?: boolean; store_name?: string }
  ): Promise<boolean> => {
    if (SENSITIVE_ACTIONS.has(action)) {
      const ok = await dibayConfirm({
        title: t("admin_biz_action_confirm_title"),
        confirmLabel: t("admin_biz_yes"),
        cancelLabel: t("admin_biz_no"),
      });
      if (!ok) return false;
    }
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return false;
      }
      refreshDetail();
      return true;
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveMemo = async () => {
    const res = await fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_admin_memo", memo: memoInput }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
      return;
    }
    refreshDetail();
  };

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  if (!payload) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_biz_not_found")}
      </div>
    );
  }

  const { store, owner, sales, stats, fee, delivery, logs } = payload;

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_biz_page_cc" backHref="/admin/business" />
      <AdminBusinessCcSummary
        store={store}
        owner={owner}
        sales={sales}
        stats={stats}
        fee={fee}
        delivery={delivery}
      />

      <AdminCard titleKey="admin_biz_card_ops">
        <AdminStoreReviewTheme>
          <AdminStoreReviewPanel
            store={store}
            actionBusy={actionBusy}
            onRunAction={(action, payloadArgs) => runStoreAction(action, payloadArgs)}
            onSetOwnerIdentityEditable={(enabled) =>
              void runStoreAction("set_owner_identity_editable", { enabled })
            }
            identityActionBusy={actionBusy}
          />
        </AdminStoreReviewTheme>
      </AdminCard>

      <AdminCard titleKey="admin_biz_card_category">
        <AdminBusinessCcTaxonomyEditor
          store={store}
          busy={actionBusy}
          onSaved={refreshDetail}
        />
      </AdminCard>

      <AdminCard titleKey="admin_biz_card_contact">
        <AdminBusinessCcContactEditor
          store={store}
          busy={actionBusy}
          onSaved={refreshDetail}
        />
      </AdminCard>

      <AdminCard titleKey="admin_biz_card_delivery">
        <AdminBusinessCcDeliveryCard delivery={delivery} />
        <AdminBusinessCcDeliveryOverrideEditor
          storeId={store.id}
          currentMode={delivery.storeOverrideMode}
          currentMaxKm={delivery.storeOverrideMaxKm}
          onSaved={refreshDetail}
        />
      </AdminCard>

      <AdminCard titleKey="admin_biz_card_fee">
        <AdminBusinessCcFeeCard fee={fee} />
        <AdminBusinessCcFeeOverrideEditor
          storeId={store.id}
          fee={fee}
          onSaved={refreshDetail}
        />
      </AdminCard>

      <AdminCard titleKey="admin_biz_card_links">
        <AdminBusinessCcLinks
          storeId={store.id}
          ownerUserId={owner.ownerUserId}
          storeName={store.store_name}
          slug={store.slug}
          stats={stats}
        />
      </AdminCard>

      <AdminCard titleKey="admin_biz_card_memo">
        <div className="flex gap-2">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder={t("admin_biz_memo_ph")}
            className="flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <button
            type="button"
            onClick={() => void handleSaveMemo()}
            className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted"
          >
            {t("common_save")}
          </button>
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_biz_card_history">
        <AdminBusinessLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
