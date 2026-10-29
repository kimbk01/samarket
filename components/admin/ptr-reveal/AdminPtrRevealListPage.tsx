"use client";

import { useCallback, useEffect, useState } from "react";
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
  const { language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const L = useCallback((ko: string, en: string) => (lang === "en" ? en : ko), [lang]);
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

  const create = async () => {
    const name = await askInput({
      title: L("새 당겨서 새로고침 광고", "New pull-to-refresh ad"),
      description: L("광고 이름을 입력하세요. 나머지 설정은 다음 화면에서 합니다.", "Enter a name. You set the rest on the next screen."),
      inputLabel: L("광고 이름", "Ad name"),
      confirmLabel: L("만들기", "Create"),
      cancelLabel: L("취소", "Cancel"),
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
    const copyOk = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: ko,
      title: L("광고 복사", "Copy ad"),
      description: L(`「${item.name}」을 복사할까요? (승인·기간 제외)`, `Copy “${item.name}”? (approval and schedule excluded)`),
      confirmLabel: L("복사", "Copy"),
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
          <h1 className="text-[16px] font-semibold text-sam-fg">{L("당겨서 새로고침 광고", "Pull-to-refresh ads")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-sam-muted">
            {L(
              "목록을 아래로 당겨 새로고침할 때 스피너 뒤에 드러나는 띠 광고입니다. 팝업과 별도로 운영되며 승인·기간·통계 규칙은 팝업과 같습니다.",
              "A band ad revealed behind the spinner when a list is pulled to refresh. Operated separately from popups, with the same approval, schedule and stats rules."
            )}
          </p>
        </div>
        <AdminActionButton variant="secondary" disabled={busy} onClick={() => void create()} data-admin-ptr-create="">
          {L("새 광고 만들기", "New ad")}
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
        searchPlaceholder={L("이름·문구·이동 경로 검색", "Search name, text or link")}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          label: L("상태", "Status"),
          options: [
            { value: "", label: L("모든 상태", "All statuses") },
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
        : <AdminEmptyState ko={ko} message={L("등록된 당겨서 새로고침 광고가 없습니다.", "No pull-to-refresh ads yet.")} />
      : <>
        <AdminManagementTableViewport>
          <table className="min-w-full border-collapse text-[13px]" data-admin-ptr-table="">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[12px] text-sam-muted">
                <th className={TH}>{L("광고 이미지", "Creative")}</th>
                <th className={TH}>{L("이름", "Name")}</th>
                <th className={TH}>{L("위치", "Where")}</th>
                <th className={TH}>{L("기간", "Schedule")}</th>
                <th className={TH}>{L("상태", "Status")}</th>
                <th className={`${TH} text-right`}>{L("관리", "Actions")}</th>
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
                    {item.startAt ? formatAdminManilaDateTime(item.startAt) : L("시작 즉시", "Immediate")} ~{" "}
                    {item.endAt ? formatAdminManilaDateTime(item.endAt) : L("종료일 없음", "No end")}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <AdminToneBadge tone={item.status === "active" ? "success" : item.status === "rejected" || item.status === "ended" ? "danger" : "neutral"}>
                      {platformPopupCampaignStatusLabel(item.status, lang)}
                    </AdminToneBadge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => void copy(item)}>
                        {L("복사", "Copy")}
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
