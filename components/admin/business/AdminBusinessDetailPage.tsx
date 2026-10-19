"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  BusinessCcDeliverySnapshot,
  BusinessCcFeeSnapshot,
  BusinessCcKpiSummary,
  BusinessCcOpsOverview,
  BusinessCcOwner,
  BusinessCcSalesPermission,
  BusinessCcStats,
} from "@/lib/admin-business/load-business-control-center-detail";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  ADMIN_STORE_ACTION_COPY,
  AdminStoreReviewPanel,
  adminStoreActionSuccessMessage,
} from "@/components/admin/stores/AdminStoreReviewPanel";
import { AdminStoreReviewTheme } from "@/components/admin/stores/admin-store-review-ui";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import {
  AdminBusinessCcDeliveryCard,
  AdminBusinessCcFeeCard,
  AdminBusinessCcLinks,
  AdminBusinessCcStatusPanel,
  AdminBusinessCcSummary,
} from "./AdminBusinessCcPanels";
import {
  AdminBusinessCcBusinessHoursEditor,
  AdminBusinessCcContactEditor,
  AdminBusinessCcDeliveryOverrideEditor,
  AdminBusinessCcFeeOverrideEditor,
  AdminBusinessCcLocationEditor,
  AdminBusinessCcOpsFlagsEditor,
  AdminBusinessCcTaxonomyEditor,
} from "./AdminBusinessCcManageEditors";
import {
  AdminBusinessOpsIdentityHeader,
  AdminBusinessOpsOverviewGrid,
  AdminBusinessOpsQuickActions,
  AdminBusinessOpsRiskPanel,
} from "./AdminBusinessOpsOverview";
import {
  businessCcAuditHref,
  businessCcPointsHref,
  businessCcReportsHref,
} from "@/lib/admin-business/business-control-center-links";

type TabId =
  | "overview"
  | "basic"
  | "hours"
  | "products"
  | "orders"
  | "delivery"
  | "points"
  | "fee"
  | "settlement"
  | "reviews"
  | "reports"
  | "history";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "overview", labelKey: "admin_biz_ops_nav_overview" },
  { id: "basic", labelKey: "admin_biz_ops_nav_basic" },
  { id: "hours", labelKey: "admin_biz_ops_nav_hours" },
  { id: "products", labelKey: "admin_biz_ops_nav_products" },
  { id: "orders", labelKey: "admin_biz_ops_nav_orders" },
  { id: "delivery", labelKey: "admin_biz_ops_nav_delivery" },
  { id: "points", labelKey: "admin_biz_ops_nav_points" },
  { id: "fee", labelKey: "admin_biz_ops_nav_fee" },
  { id: "settlement", labelKey: "admin_biz_ops_nav_settlement" },
  { id: "reviews", labelKey: "admin_biz_ops_nav_reviews" },
  { id: "reports", labelKey: "admin_biz_ops_nav_reports" },
  { id: "history", labelKey: "admin_biz_ops_nav_history" },
];

/** DEF-19 — 작업 기록 이름 (audit action `store.<action>` → 운영자 문구). */
const AUDIT_ACTION_LABELS: Record<string, [string, string]> = {
  start_review: ["심사 시작", "Review started"],
  mark_under_review: ["심사 시작", "Review started"],
  approve_store: ["입점 승인", "Store approved"],
  reject_store: ["입점 거절", "Store rejected"],
  request_revision: ["보완 요청", "Changes requested"],
  suspend_store: ["운영 중지", "Store suspended"],
  resume_store: ["운영 재개", "Store resumed"],
  approve_sales: ["판매 승인", "Sales approved"],
  reject_sales: ["판매 거절", "Sales rejected"],
  suspend_sales: ["판매 중지", "Sales suspended"],
  set_store_visible: ["노출 변경", "Visibility changed"],
  set_owner_identity_editable: ["매장명 수정 권한 변경", "Name edit permission changed"],
  set_admin_memo: ["관리자 메모 저장", "Admin memo saved"],
  set_store_name: ["매장명 변경", "Store name changed"],
  set_store_taxonomy: ["업종 변경", "Category changed"],
  set_store_contact: ["연락처 변경", "Contact changed"],
  set_store_location: ["위치 변경", "Location changed"],
  set_business_hours: ["영업시간 변경", "Business hours changed"],
  set_delivery_flags: ["영업·배달 설정 변경", "Open/delivery settings changed"],
  set_delivery_radius: ["배달 반경 변경", "Delivery radius changed"],
};

export function mapAuditAction(action: string, ko: boolean): string {
  const key = action.trim().replace(/^store\./, "");
  const hit = AUDIT_ACTION_LABELS[key];
  if (hit) return ko ? hit[0] : hit[1];
  return ko ? "매장 정보 변경" : "Store updated";
}

type CcAuditLog = { id: string; actionType: string; adminId: string; note: string; createdAt: string };

function safeErrorCode(raw: unknown, status: number): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (/^[a-z][a-z0-9_]*$/.test(s)) return s;
  return status === 403 ? "forbidden" : "load_failed";
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
    place_id: typeof store.place_id === "string" ? store.place_id : null,
    formatted_address:
      typeof store.formatted_address === "string" ? store.formatted_address : null,
    detail_address: typeof store.detail_address === "string" ? store.detail_address : null,
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
  kpi: BusinessCcKpiSummary;
  fee: BusinessCcFeeSnapshot;
  delivery: BusinessCcDeliverySnapshot;
  ops: BusinessCcOpsOverview;
  logs: CcAuditLog[];
  adminMemo: string;
  businessHoursJson: unknown;
};

const emptyOps: BusinessCcOpsOverview = {
  openKind: "closed",
  settlementKind: "ok",
  categoryName: "",
  regionLine: "",
  ratingAvg: null,
  reviewCountFromStore: 0,
  pointBalance: null,
  pointCommerceBlocked: false,
  recentPointCredit: null,
  recentPointDebit: null,
  todayOrderCount: 0,
  todaySalesAmount: 0,
  productActiveCount: 0,
  productSoldOutCount: 0,
  productInactiveCount: 0,
  reportTotalCount: 0,
  trend7d: [],
};

export function AdminBusinessDetailPage({ profileId }: AdminBusinessDetailPageProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const searchParams = useSearchParams();
  const backHref = readAdminReturnToFromSearch(searchParams) ?? "/admin/business";
  const [refresh, setRefresh] = useState(0);
  const [tab, setTabState] = useState<TabId>(() => {
    const raw = searchParams.get("tab")?.trim();
    if (raw && TABS.some((x) => x.id === raw)) return raw as TabId;
    return "overview";
  });
  const setTab = useCallback(
    (next: TabId) => {
      setTabState(next);
      const qs = new URLSearchParams(searchParams.toString());
      qs.set("tab", next);
      router.replace(`/admin/business/${encodeURIComponent(profileId)}?${qs.toString()}`, {
        scroll: false,
      });
    },
    [profileId, router, searchParams]
  );
  const [memoInput, setMemoInput] = useState("");
  const [payload, setPayload] = useState<CcPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (r) => ({ status: r.status, j: ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown> }))
      .then(
        ({ status, j: raw }) => {
          const j = raw as {
          ok?: boolean;
          error?: string;
          store?: Record<string, unknown>;
          owner?: BusinessCcOwner;
          ownerNickname?: string;
          salesPermission?: BusinessCcSalesPermission;
          stats?: BusinessCcStats;
          kpi?: BusinessCcKpiSummary;
          fee?: BusinessCcFeeSnapshot;
          delivery?: BusinessCcDeliverySnapshot;
          ops?: BusinessCcOpsOverview;
          logs?: Array<{
            id: string;
            actionType: string;
            adminId: string;
            note: string;
            createdAt: string;
          }>;
          };
          if (cancelled) return;
          if (!j.ok || !j.store) {
            setPayload(null);
            setLoadError({ code: safeErrorCode(j.error, status), status });
            return;
          }
          const owner: BusinessCcOwner = j.owner ?? {
            ownerUserId: String(j.store.owner_user_id ?? ""),
            displayLabel: String(j.ownerNickname ?? ""),
            username: null,
            handle: null,
            identityOk: Boolean(String(j.ownerNickname ?? "").trim()),
          };
          if (owner.identityOk == null) {
            owner.identityOk = Boolean(owner.displayLabel.trim());
          }
          const reviewRow = toReviewRow(j.store, owner);
          const memo =
            typeof j.store.admin_internal_memo === "string"
              ? j.store.admin_internal_memo
              : "";
          setMemoInput(memo);
          const stats = j.stats ?? { productCount: 0, reviewCount: 0 };
          setPayload({
            store: reviewRow,
            owner,
            sales: j.salesPermission ?? null,
            stats,
            kpi: j.kpi ?? {
              inProgressOrderCount: 0,
              orderStatusCounts: {
                pending: 0,
                inProgress: 0,
                completed: 0,
                cancelled: 0,
                refundRequested: 0,
              },
              recentOrders: [],
              soldOutProductCount: 0,
              productCount: stats.productCount,
              recentCommissions: [],
              commissionCounts: { charged: 0, outstanding: 0, reviewRequired: 0 },
              openReportCount: 0,
              reviewCount: stats.reviewCount,
              hiddenReviewCount: 0,
            },
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
              frontOpenForCommerce: false,
              inBreak: false,
              hoursLabel: null,
              weekdaysLabel: null,
              autoHoursEnabled: null,
              scheduleEnforced: null,
              prepTimeMinutes: null,
              breakRangeLabel: null,
              customerDeliveryFeeMode: null,
              customerDeliveryFeePhp: null,
              customerMinOrderPhp: null,
              customerFreeDeliveryOverPhp: null,
              lat: null,
              lng: null,
              distancePolicyEnabled: false,
              applies: false,
              maxKm: null,
              deliveryRadiusKm: null,
              updatedAt: null,
              policySource: "off",
              storeOverrideMode: null,
              storeOverrideMaxKm: null,
            },
            ops: j.ops ?? emptyOps,
            logs: j.logs ?? [],
            adminMemo: memo,
            businessHoursJson: j.store.business_hours_json ?? null,
          });
        }
      )
      .catch(() => {
        if (!cancelled) {
          setPayload(null);
          setLoadError({ code: "network_error" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, refresh]);

  /**
   * PATCH /api/admin/stores/[id] — 확인 팝업은 호출부(심사 패널·빠른 조치)에서 끝낸 뒤 들어온다.
   * 결과는 화면 상단 배너로 표시 (원시 오류 코드 노출 금지).
   */
  const runStoreAction = async (
    action: string,
    body?: { reason?: string; enabled?: boolean; store_name?: string } & Record<
      string,
      unknown
    >
  ): Promise<boolean> => {
    setActionBusy(true);
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const j = ((await res.json().catch(() => null)) ?? {}) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setActionResult({ ok: false, code: j.error ?? (res.status === 403 ? "forbidden" : "action_failed") });
        return false;
      }
      setActionResult({
        ok: true,
        message:
          action === "set_delivery_flags"
            ? ko
              ? "영업 설정을 저장했습니다."
              : "Open settings saved."
            : adminStoreActionSuccessMessage(
                action,
                ko,
                typeof body?.enabled === "boolean" ? body.enabled : undefined
              ),
      });
      refreshDetail();
      return true;
    } catch {
      setActionResult({ ok: false, code: "network_error" });
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  /** 빠른 조치 — 조치별 확인 문구 (L1 영업 스위치 · L2 판매 중지). */
  const runQuickAction = async (kind: "temp_close" | "resume_open" | "suspend_sales") => {
    if (!payload) return;
    const d = payload.delivery;
    if (kind === "suspend_sales") {
      const c = ADMIN_STORE_ACTION_COPY.suspend_sales;
      const confirmed = await confirmAdminAction({
        level: "L2",
        ko,
        title: ko ? c.titleKo : c.titleEn,
        description: ko ? c.descKo : c.descEn,
        confirmLabel: ko ? c.ko : c.en,
        destructive: true,
      });
      if (!confirmed.ok) return;
      await runStoreAction("suspend_sales", { reason: confirmed.reason ?? undefined });
      return;
    }
    const closing = kind === "temp_close";
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: closing
        ? ko
          ? "매장을 임시 휴업으로 바꿀까요?"
          : "Temporarily close this store?"
        : ko
          ? "매장 영업을 다시 시작할까요?"
          : "Reopen this store?",
      description: closing
        ? ko
          ? "새 주문을 받지 않습니다. 사장님 앱의 영업 스위치도 꺼집니다."
          : "New orders stop. The owner's open switch is turned off."
        : undefined,
      confirmLabel: closing ? (ko ? "임시 휴업" : "Close") : ko ? "영업 재개" : "Reopen",
      destructive: closing,
    });
    if (!confirmed.ok) return;
    await runStoreAction("set_delivery_flags", {
      is_open: !closing,
      delivery_available: d.deliveryAvailable ?? undefined,
      pickup_available: d.pickupAvailable ?? undefined,
    });
  };

  const handleSaveMemo = async () => {
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_admin_memo", memo: memoInput }),
      });
      const j = ((await res.json().catch(() => null)) ?? {}) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setActionResult({ ok: false, code: j.error ?? "update_failed" });
        return;
      }
      setActionResult({ ok: true, message: ko ? "관리자 메모를 저장했습니다." : "Admin memo saved." });
      refreshDetail();
    } catch {
      setActionResult({ ok: false, code: "network_error" });
    }
  };

  if (loading && !payload) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_biz_page_cc" backHref={backHref} />
        <AdminLoadingState ko={ko} />
      </div>
    );
  }

  if (!payload) {
    const notFound = loadError?.status === 404 || loadError?.code === "store_not_found";
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_biz_page_cc" backHref={backHref} />
        {notFound ? (
          <AdminEmptyState
            ko={ko}
            message={ko ? "매장을 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었습니다." : "Store not found. It may be deleted or the link is wrong."}
            action={
              <Link href={backHref} className="text-signature hover:underline">
                {ko ? "매장 목록으로" : "Back to stores"}
              </Link>
            }
          />
        ) : (
          <AdminErrorState
            ko={ko}
            code={loadError?.code ?? "load_failed"}
            httpStatus={loadError?.status}
            onRetry={refreshDetail}
          />
        )}
      </div>
    );
  }

  const { store, owner, sales, stats, kpi, fee, delivery, ops, logs } = payload;
  const salesStatus = sales?.sales_status?.trim() || (sales ? (sales.allowed_to_sell ? "approved" : "pending") : null);
  const linkBtn =
    "inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted";

  return (
    <div className="space-y-4" key={profileId} data-store-id={profileId}>
      <AdminPageHeader titleKey="admin_biz_page_cc" backHref={backHref} />

      <AdminResultBanner ko={ko} result={actionResult} onClose={() => setActionResult(null)} />

      <AdminBusinessOpsIdentityHeader
        store={store}
        owner={owner}
        ops={ops}
        sales={sales}
        delivery={delivery}
      />

      <nav className="flex flex-wrap gap-1 border-b border-sam-border pb-2">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded px-2.5 py-1.5 sam-text-helper font-medium ${
                active
                  ? "bg-signature text-white"
                  : "text-sam-fg hover:bg-sam-surface-muted"
              }`}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </nav>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <AdminBusinessOpsOverviewGrid
              storeId={store.id}
              storeName={store.store_name}
              ops={ops}
              delivery={delivery}
              kpi={kpi}
              onGoTab={(id) => setTab(id as TabId)}
            />
            <div className="space-y-3">
              <AdminBusinessOpsQuickActions
                busy={actionBusy}
                isOpen={delivery.isOpen}
                trend={ops.trend7d}
                onGoHours={() => setTab("hours")}
                onTempClose={() => void runQuickAction("temp_close")}
                onResumeOpen={() => void runQuickAction("resume_open")}
                onSalesLimit={() => void runQuickAction("suspend_sales")}
                pointsHref={businessCcPointsHref(store.id)}
              />
              <AdminBusinessOpsRiskPanel
                store={store}
                ops={ops}
                sales={sales}
                delivery={delivery}
                kpi={kpi}
              />
            </div>
          </div>

          <details
            className="rounded-ui-rect border border-sam-border bg-sam-app shadow-sm"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer px-4 py-3 sam-text-helper font-medium text-sam-muted">
              {t("admin_biz_ops_advanced")}
            </summary>
            <div className="space-y-4 border-t border-sam-border px-4 py-4">
              <AdminBusinessCcSummary
                store={store}
                owner={owner}
                sales={sales}
                stats={stats}
                fee={fee}
                delivery={delivery}
              />
              <AdminBusinessCcStatusPanel store={store} sales={sales} delivery={delivery} />
            </div>
          </details>
        </div>
      ) : null}

      {tab === "basic" ? (
        <div className="space-y-4">
          <AdminCard titleKey="admin_biz_card_ops">
            <AdminStoreReviewTheme>
              <AdminStoreReviewPanel
                store={store}
                salesStatus={salesStatus}
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
            <AdminBusinessCcLocationEditor
              store={store}
              busy={actionBusy}
              onSaved={refreshDetail}
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
                className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted"
              >
                {ko ? "저장" : "Save"}
              </button>
            </div>
          </AdminCard>
        </div>
      ) : null}

      {tab === "hours" ? (
        <div className="space-y-4">
          <AdminCard title={ko ? "영업시간" : "Business hours"}>
            <AdminBusinessCcBusinessHoursEditor
              storeId={store.id}
              businessHoursJson={payload.businessHoursJson}
              busy={actionBusy}
              onSaved={refreshDetail}
            />
          </AdminCard>
          <AdminCard title={ko ? "영업·배달·포장 설정" : "Open, delivery and pickup"}>
            <AdminBusinessCcOpsFlagsEditor
              storeId={store.id}
              deliveryAvailable={delivery.deliveryAvailable}
              pickupAvailable={delivery.pickupAvailable}
              isOpen={delivery.isOpen}
              busy={actionBusy}
              onSaved={refreshDetail}
            />
          </AdminCard>
        </div>
      ) : null}

      {tab === "delivery" ? (
        <AdminCard titleKey="admin_biz_card_delivery">
          <AdminBusinessCcDeliveryCard delivery={delivery} />
          <p className="mt-3 sam-text-helper text-sam-muted">
            {ko
              ? "영업·배달·포장 켜기/끄기는 「영업관리」 탭에서 바꿉니다. 이 탭에서는 배달 반경과 서비스 지역을 관리합니다."
              : "Open/delivery/pickup switches live on the Hours tab. This tab manages radius and service area."}
          </p>
          <AdminBusinessCcDeliveryOverrideEditor
            storeId={store.id}
            currentMode={delivery.storeOverrideMode}
            currentDeliveryRadiusKm={delivery.deliveryRadiusKm}
            currentEffectiveMaxKm={delivery.maxKm}
            onSaved={refreshDetail}
          />
        </AdminCard>
      ) : null}

      {tab === "fee" ? (
        <AdminCard titleKey="admin_biz_card_fee">
          <AdminBusinessCcFeeCard fee={fee} />
          <AdminBusinessCcFeeOverrideEditor
            storeId={store.id}
            fee={fee}
            onSaved={refreshDetail}
          />
        </AdminCard>
      ) : null}

      {tab === "reports" ? (
        <AdminCard title={ko ? "신고 / 제재" : "Reports / sanctions"}>
          <div className="space-y-3" data-admin-store-reports-tab="1">
            <dl className="grid gap-2 sam-text-body sm:grid-cols-3">
              <div>
                <dt className="sam-text-helper text-sam-muted">{ko ? "처리 대기 신고" : "Open reports"}</dt>
                <dd className={kpi.openReportCount > 0 ? "font-semibold text-red-700" : "font-semibold"}>
                  {ko ? `${kpi.openReportCount}건` : kpi.openReportCount}
                </dd>
              </div>
              <div>
                <dt className="sam-text-helper text-sam-muted">{ko ? "전체 신고" : "All reports"}</dt>
                <dd className="font-semibold">{ko ? `${ops.reportTotalCount}건` : ops.reportTotalCount}</dd>
              </div>
              <div>
                <dt className="sam-text-helper text-sam-muted">{ko ? "현재 상태" : "Current status"}</dt>
                <dd className="font-semibold">
                  {store.approval_status === "suspended"
                    ? ko
                      ? "운영 중지"
                      : "Suspended"
                    : salesStatus === "suspended"
                      ? ko
                        ? "판매 중지"
                        : "Sales suspended"
                      : ko
                        ? "제재 없음"
                        : "No sanction"}
                </dd>
              </div>
            </dl>
            {store.suspended_reason?.trim() ? (
              <p className="sam-text-helper text-sam-muted">
                {ko ? "중지 사유" : "Suspension reason"}: {store.suspended_reason.trim()}
              </p>
            ) : null}
            <p className="sam-text-helper text-sam-muted">
              {ko
                ? "신고 처리(조치 완료·기각)는 매장 신고 화면에서 합니다. 운영 중지·판매 중지는 「기본정보」 탭의 입점/운영 조치에서 사유와 함께 처리합니다."
                : "Handle reports on the Store reports screen. Suspend store/sales from the Basic tab with a reason."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={businessCcReportsHref(store.id)} className={linkBtn}>
                {ko ? "이 매장 신고 보기" : "View this store's reports"}
              </Link>
              <button type="button" className={linkBtn} onClick={() => setTab("basic")}>
                {ko ? "운영 조치로 이동" : "Go to store actions"}
              </button>
            </div>
          </div>
        </AdminCard>
      ) : null}

      {tab === "history" ? (
        <AdminCard title={ko ? "작업 기록" : "Activity log"}>
          {logs.length === 0 ? (
            <AdminEmptyState ko={ko} message={ko ? "작업 기록이 없습니다." : "No activity yet."} />
          ) : (
            <ul className="space-y-2" data-admin-store-history="1">
              {logs.map((log) => (
                <li key={log.id} className="border-b border-sam-border-soft pb-2 sam-text-body-secondary last:border-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-sam-fg">{mapAuditAction(log.actionType, ko)}</span>
                    <span className="text-sam-muted">{ko ? "관리자" : "Admin"}</span>
                    <span className="ml-auto text-sam-meta">{formatAdminDateTime(log.createdAt, language)}</span>
                  </div>
                  <AdminTechDetails ko={ko}>
                    <div>action: {log.actionType}</div>
                    <div>admin_id: {log.adminId || "—"}</div>
                    {log.note ? <div>{log.note}</div> : null}
                  </AdminTechDetails>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Link href={businessCcAuditHref(store.id)} className={linkBtn}>
              {ko ? "전체 작업 기록" : "Full activity log"}
            </Link>
          </div>
        </AdminCard>
      ) : null}

      {tab === "products" ||
      tab === "orders" ||
      tab === "points" ||
      tab === "settlement" ||
      tab === "reviews" ? (
        <AdminCard titleKey="admin_biz_card_links">
          <AdminBusinessCcLinks
            storeId={store.id}
            ownerUserId={owner.ownerUserId}
            storeName={store.store_name}
            slug={store.slug}
            stats={stats}
            section={tab}
          />
        </AdminCard>
      ) : null}
    </div>
  );
}
