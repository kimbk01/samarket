"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminManagementTableViewport } from "@/components/admin/management/AdminManagementTableViewport";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { ADMIN_DOMAIN_SCOPE_QUERY_KEY } from "@/lib/admin/list-query/admin-domain-scope";
import { AdminDomainScopeSelect } from "@/components/admin/ui/AdminDomainScopeSelect";
import {
  PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS,
  PLATFORM_POPUP_LIVE_STATUS_FILTER,
  platformPopupLiveStatusFilterLabel,
} from "@/lib/platform-popup/admin-list-filter";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { popupSurfaceOperatorLabel } from "@/lib/admin/promotion-ownership-visibility";
import { useAdminConfirmDialog } from "@/components/admin/ui/useAdminConfirmDialog";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import { platformPopupCampaignStatusLabel } from "@/lib/platform-popup/popup-product-labels";
import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";

/** 목록 조건 (주소 보존) — 상태(`live` = 지금 노출 중 · DB 상태값) · 검색어(이름·문구·이동 경로) · 도메인(G-06 `?domain=`). */
const PTR_LIST_QUERY_CONFIG = {
  statuses: PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS,
  extras: [ADMIN_DOMAIN_SCOPE_QUERY_KEY] as const,
};

/** 표준 관리자 표 셀 (CommunityTable 과 같은 간격) */
const TH = "whitespace-nowrap px-3 py-2 font-semibold";
const TD = "px-3 py-2 align-top";

/**
 * 관리자 「당겨서 새로고침 광고」 목록 — Platform Popup 캠페인 중 `ptr_reveal` 만 (팝업 목록과 분리).
 * R7: 서버 페이지(`limit`/`offset` → `total`) · 상태·검색은 서버 필터. 목록은 표(이미지·이름·위치·기간·상태·관리).
 */
export function AdminPtrRevealListPage() {
  const { language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  // 폼 대화상자 — 새 광고 이름 입력(prompt)만. 확인은 confirmAdminAction (R2).
  const { prompt: askInput, dialog: confirmDialog } = useAdminConfirmDialog();
  const ko = lang !== "en";
  const lq = useAdminListQuery<typeof ADMIN_DOMAIN_SCOPE_QUERY_KEY>(PTR_LIST_QUERY_CONFIG);
  const [items, setItems] = useState<PlatformPopupAdminListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiQueryString, refreshKey, refresh } = lq;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailure(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/platform-popup-campaigns?scope=ptr&${apiQueryString}`, {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: PlatformPopupAdminListItem[];
          total?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          // 실패 시 직전 목록은 유지
          setLoadFailure({ code: json.error || "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.items ?? [];
        setItems(rows);
        setTotal(typeof json.total === "number" ? json.total : rows.length);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadFailure({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshKey = apiQueryString + 새로고침 횟수
  }, [apiQueryString, refreshKey]);

  /** 재감사 S-2 (H-4): PTR 띠 만들기·복사 = ads 키 (서버 `platform-popup-campaigns` 와 같음) · AL-14: 권한 없으면 버튼도 막음 */
  const writeGuard = useAdminWriteGuard("/admin/ptr-reveal-ads");
  const create = async () => {
    if (!writeGuard.guard()) return;
    const name = await askInput({
      title: t("admin_ptr_new_pull_refresh_ad"),
      description: t("admin_ptr_enter_name_set_rest_next"),
      inputLabel: t("admin_ptr_ad_name"),
      confirmLabel: t("admin_ptr_create"),
      cancelLabel: t("admin_ptr_cancel"),
    });
    if (!name) return;
    setBusy(true);
    const res = await fetch("/api/admin/platform-popup-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), presentationType: "ptr_reveal", surfaces: ["GLOBAL"] }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(formatPlatformPopupAdminError(json.error || "create_failed", lang));
      return;
    }
    router.push(`/admin/ptr-reveal-ads/${json.id}`);
  };

  const copy = async (item: PlatformPopupAdminListItem) => {
    if (!writeGuard.guard()) return;
    const copyOk = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: ko,
      title: t("admin_ptr_copy_ad"),
      description: t("admin_ptr_copy_named_confirm", { name: item.name }),
      confirmLabel: t("admin_ptr_copy"),
    });
    if (!copyOk.ok) return;
    setBusy(true);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${item.id}/copy`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(formatPlatformPopupAdminError(json.error || "copy_failed", lang));
      return;
    }
    refresh();
  };

  return (
    <div className="space-y-4 p-4" data-admin-ptr-list="">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-sam-fg">{t("admin_ptr_pull_refresh_ads")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-sam-muted">
            {t("admin_ptr_band_ad_revealed_behind_spinner")}
          </p>
        </div>
        <AdminActionButton variant="secondary" disabled={busy || !writeGuard.allowed} onClick={() => void create()} data-admin-ptr-create="">
          {t("admin_ptr_new_ad")}
        </AdminActionButton>
      </div>

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        pending={loading}
        searchPlaceholder={t("admin_ptr_search_name_text_link")}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          label: t("admin_ptr_status"),
          options: [
            { value: "", label: t("admin_ptr_all_statuses") },
            { value: PLATFORM_POPUP_LIVE_STATUS_FILTER, label: platformPopupLiveStatusFilterLabel(lang) },
            ...PLATFORM_POPUP_CAMPAIGN_STATUSES.map((s) => ({ value: s, label: platformPopupCampaignStatusLabel(s, lang) })),
          ],
        }}
      >
        <AdminDomainScopeSelect
          ko={ko}
          value={lq.query.extras.domain}
          onChange={(v) => lq.setExtra(ADMIN_DOMAIN_SCOPE_QUERY_KEY, v)}
          includesGlobalNote
        />
      </AdminFilterBar>

      {error ? <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">{error}</p> : null}

      {loadFailure ?
        <AdminErrorState ko={ko} code={loadFailure.code} httpStatus={loadFailure.httpStatus} onRetry={refresh} />
      : null}

      {loading && !loaded ?
        <AdminLoadingState ko={ko} />
      : !loaded ?
        null
      : items.length === 0 ?
        lq.isFiltered ?
          <AdminEmptyState ko={ko} onReset={lq.reset} />
        : <AdminEmptyState
            ko={ko}
            message={t("admin_ptr_no_pull_refresh_ads")}
            action={
              <AdminActionButton
                variant="primary"
                size="sm"
                disabled={busy || !writeGuard.allowed}
                title={writeGuard.reason ?? undefined}
                onClick={() => void create()}
                data-admin-ptr-empty-create=""
              >
                {t("admin_ptr_register")}
              </AdminActionButton>
            }
          />
      : <>
        <AdminManagementTableViewport>
          <table className="min-w-full border-collapse text-[13px]" data-admin-ptr-table="">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[12px] text-sam-muted">
                <th className={TH}>{t("admin_ptr_creative")}</th>
                <th className={TH}>{t("admin_ptr_name")}</th>
                <th className={TH}>{t("admin_ptr_where")}</th>
                <th className={TH}>{t("admin_ptr_schedule")}</th>
                <th className={TH}>{t("admin_ptr_status")}</th>
                <th className={`${TH} text-right`}>{t("admin_ptr_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-sam-border last:border-b-0" data-admin-ptr-row={item.id}>
                  <td className={TD}>
                    <div className="h-10 w-40 shrink-0 overflow-hidden rounded bg-sam-surface-muted">
                      {item.creativeThumbUrl ?
                        // eslint-disable-next-line @next/next/no-img-element -- 관리자 썸네일(휴대폰 띠)
                        <img src={item.creativeThumbUrl} alt="" className="h-full w-full object-cover" />
                      : null}
                    </div>
                  </td>
                  <td className={`${TD} min-w-[160px]`}>
                    <Link href={`/admin/ptr-reveal-ads/${item.id}`} className="block text-[14px] font-semibold text-sam-fg hover:underline">
                      {item.name}
                    </Link>
                  </td>
                  <td className={`${TD} text-[12px] text-sam-muted`}>
                    {item.surfaces.map((sf) => popupSurfaceOperatorLabel(sf, lang)).join(", ") || "—"}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[12px] text-sam-muted`}>
                    {item.startAt ? formatAdminManilaDateTime(item.startAt) : t("admin_ptr_immediate")} ~{" "}
                    {item.endAt ? formatAdminManilaDateTime(item.endAt) : t("admin_ptr_no_end")}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <AdminToneBadge tone={item.status === "active" ? "success" : item.status === "rejected" || item.status === "ended" ? "danger" : "neutral"}>
                      {platformPopupCampaignStatusLabel(item.status, lang)}
                    </AdminToneBadge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <AdminActionButton variant="ghost" size="sm" disabled={busy || !writeGuard.allowed} onClick={() => void copy(item)}>
                        {t("admin_ptr_copy")}
                      </AdminActionButton>
                      <AdminActionLink href={`/admin/ptr-reveal-ads/${item.id}`} variant="ghost" size="sm">
                        {adminCta("edit", ko)}
                      </AdminActionLink>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminManagementTableViewport>
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
      </>
      }
    </div>
  );
}
