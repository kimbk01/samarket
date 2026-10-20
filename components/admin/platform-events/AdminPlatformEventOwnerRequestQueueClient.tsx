"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import type { PlatformEventOwnerRequestRow } from "@/lib/platform-event-owner-requests/types";
import {
  ownerRequestOperatorStatusLabel,
  resolveOwnerRequestOperatorStatus,
} from "@/lib/admin/promotion-operation-status";

/**
 * 오너 이벤트 요청 큐 (R7) — 서버 페이지(`limit`/`offset` → `total`) · 쪽·크기 주소 보존.
 * 필터 없음(8 N/A). 불러오기 실패 시 직전 목록 유지.
 */
export function AdminPlatformEventOwnerRequestQueueClient() {
  const { safeT, language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const ko = lang !== "en";
  const lq = useAdminListQuery();
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
      {error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={refresh} />
      ) : null}
      {loading && !loaded ? (
        <AdminLoadingState ko={ko} />
      ) : !loaded ? null : items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_promotion_owner_request_empty", {
            fallbackKo: "대기 중인 오너 요청이 없습니다.",
            fallbackEn: "No owner requests.",
          })}
        />
      ) : (
        <>
          <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
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
                <li key={item.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{item.title || "—"}</div>
                      <div className="mt-1 text-xs text-sam-muted">
                        {lang === "en" ? "Requested channels" : "요청 채널"}:{" "}
                        {channels || (lang === "en" ? "none" : "없음")}
                        <span className="ml-2 text-sam-muted/80">
                          ({lang === "en" ? "not active yet" : "아직 활성 아님"})
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <AdminToneBadge tone="waiting">
                        {ownerRequestOperatorStatusLabel(op, lang)}
                      </AdminToneBadge>
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
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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
