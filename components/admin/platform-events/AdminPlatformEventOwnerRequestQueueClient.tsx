"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminManagementTableViewport } from "@/components/admin/management/AdminManagementTableViewport";
import {
  PLATFORM_EVENT_OWNER_REQUEST_STATUSES,
  type PlatformEventOwnerRequestRow,
} from "@/lib/platform-event-owner-requests/types";
import {
  ownerRequestOperatorStatusLabel,
  resolveOwnerRequestOperatorStatus,
} from "@/lib/admin/promotion-operation-status";

/** 목록 조건 (주소 보존) — 상태만 (API `status` → `request_status` 일치). 검색어는 API 미지원이라 두지 않는다. */
const OWNER_REQUEST_LIST_QUERY_CONFIG = { statuses: PLATFORM_EVENT_OWNER_REQUEST_STATUSES };

/** 표준 관리자 표 셀 (CommunityTable 과 같은 간격) */
const TH = "whitespace-nowrap px-3 py-2 font-semibold";
const TD = "px-3 py-2 align-top";

/**
 * 오너 이벤트 요청 큐 (R7) — 서버 페이지(`limit`/`offset` → `total`) · 쪽·크기·상태 주소 보존.
 * 상태 필터는 서버 적용. 불러오기 실패 시 직전 목록 유지. 목록은 표(제목·요청 채널·상태·관리).
 */
export function AdminPlatformEventOwnerRequestQueueClient() {
  const { safeT, language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const ko = lang !== "en";
  const lq = useAdminListQuery(OWNER_REQUEST_LIST_QUERY_CONFIG);
  const [items, setItems] = useState<PlatformEventOwnerRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const { apiQueryString, refreshKey, refresh } = lq;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/platform-event-owner-requests?${apiQueryString}`, {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: PlatformEventOwnerRequestRow[];
          total?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError({ code: json.error || "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.items ?? [];
        setItems(rows);
        setTotal(typeof json.total === "number" ? json.total : rows.length);
        setLoaded(true);
      } catch {
        if (!cancelled) setError({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshKey = apiQueryString + 새로고침 횟수
  }, [apiQueryString, refreshKey]);

  return (
    <div className="space-y-4 p-4" data-admin-event-owner-request-queue="1">
      <div>
        <h1 className="text-[16px] font-semibold">
          {t("admin_menu_promotion_owner_requests")}
        </h1>
        <p className="mt-1 text-sm text-sam-muted" data-admin-owner-request-boundary="1">
          {safeT("admin_promotion_owner_request_boundary", {
            fallbackKo:
              "요청한 채널 ≠ 실제 노출 채널입니다. 승인하면 이벤트 초안만 만들어지며, 게시·배너 활성화·Push 발송은 하지 않습니다.",
            fallbackEn:
              "Requested channels ≠ active channels. Approve creates an Event draft only — not publish, banner activate, or Push send.",
          })}
        </p>
      </div>
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        pending={loading}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          label: lang === "en" ? "Status" : "상태",
          options: [
            { value: "", label: lang === "en" ? "All statuses" : "모든 상태" },
            ...PLATFORM_EVENT_OWNER_REQUEST_STATUSES.map((s) => ({
              value: s,
              label: ownerRequestOperatorStatusLabel(resolveOwnerRequestOperatorStatus(s), lang),
            })),
          ],
        }}
      />
      {error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={refresh} />
      ) : null}
      {loading && !loaded ? (
        <AdminLoadingState ko={ko} />
      ) : !loaded ? null : items.length === 0 && lq.isFiltered ? (
        <AdminEmptyState ko={ko} onReset={lq.reset} />
      ) : items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_promotion_owner_request_empty", {
            fallbackKo: "대기 중인 오너 요청이 없습니다.",
            fallbackEn: "No owner requests.",
          })}
        />
      ) : (
        <>
          <AdminManagementTableViewport>
            <table className="min-w-full border-collapse text-[13px]" data-admin-owner-request-table="1">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app text-left text-[12px] text-sam-muted">
                  <th className={TH}>{lang === "en" ? "Title" : "제목"}</th>
                  <th className={TH}>{lang === "en" ? "Requested channels" : "요청 채널"}</th>
                  <th className={TH}>{lang === "en" ? "Status" : "상태"}</th>
                  <th className={`${TH} text-right`}>{lang === "en" ? "Actions" : "관리"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const op = resolveOwnerRequestOperatorStatus(item.requestStatus);
                  const ch = item.requestedChannels;
                  const channels = [
                    ch.popup ? (lang === "en" ? "Popup" : "팝업") : null,
                    ch.banner ? (lang === "en" ? "Banner" : "배너") : null,
                    ch.push ? "Push" : null,
                    ch.bell ? (lang === "en" ? "Bell" : "알림함") : null,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <tr key={item.id} className="border-b border-sam-border last:border-b-0">
                      <td className={`${TD} min-w-[200px] font-medium text-sam-fg`}>{item.title || "—"}</td>
                      <td className={`${TD} text-[12px] text-sam-muted`}>
                        {channels || (lang === "en" ? "none" : "없음")}
                        <span className="ml-2 text-sam-muted/80">
                          ({lang === "en" ? "not active yet" : "아직 활성 아님"})
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <AdminToneBadge tone="waiting">
                          {ownerRequestOperatorStatusLabel(op, lang)}
                        </AdminToneBadge>
                      </td>
                      <td className={`${TD} text-right`}>
                        <AdminActionLink
                          href={`/admin/platform-event-owner-requests/${encodeURIComponent(item.id)}`}
                          variant="ghost"
                          size="sm"
                        >
                          {safeT("admin_promotion_action_review", {
                            fallbackKo: "검토",
                            fallbackEn: "Review",
                          })}
                        </AdminActionLink>
                      </td>
                    </tr>
                  );
                })}
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
      )}
      <Link href="/admin/platform-promotion" className="text-xs text-sam-muted underline">
        {safeT("admin_menu_promotion", {
          fallbackKo: "프로모션 / 이벤트",
          fallbackEn: "Promotion / Events",
        })}
      </Link>
    </div>
  );
}
