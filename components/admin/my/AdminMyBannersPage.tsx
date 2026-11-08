"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { ADMIN_BANNER_DISPLAY_STATUS_KEYS } from "@/components/admin/banners/admin-banner-i18n";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminBannerStatusBadge } from "@/components/admin/banners/AdminBannerStatusBadge";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";
import { adminBannerDisplayStatus, type AdminBannerDisplayStatus } from "@/lib/admin-banners/admin-banner-utils";
import type { AdminBanner } from "@/lib/types/admin-banner";
import { translateBy } from "@/lib/i18n/translate-by";

/** V3-11 — 브라우저 직접 조회 대신 기존 관리자 API(`GET /api/admin/banners`, my_page_banners) 사용. */
export function AdminMyBannersPage() {
  const { t, language } = useI18n();
  /** G-18: 마이페이지 배너 등록·수정·삭제 = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminWriteGuard("/admin/my/banners");
  const [items, setItems] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  /** 조회 실패 = 오류 상태 + [새로고침] (R7 화면 상태). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/banners", { cache: "no-store", credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          banners?: AdminBanner[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || json.ok === false) {
          setError(json.error ?? "load_failed");
          setHttpStatus(res.status);
        } else {
          setError(null);
          setHttpStatus(undefined);
          setItems(json.banners ?? []);
        }
      } catch {
        if (cancelled) return;
        setError("network_error");
        setHttpStatus(undefined);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const ko = language !== "en";
  /** 상태 필터 — API(GET /api/admin/banners)는 조건 없이 전체를 주므로 화면에서 거른다. */
  const [statusFilter, setStatusFilter] = useState<"" | AdminBannerDisplayStatus>("");
  const visibleItems = useMemo(
    // 광고 최종 점검 B-7: 기간이 지난 「활성」은 「만료」로 거른다 (표시 상태와 같은 판정)
    () => (statusFilter ? items.filter((b) => adminBannerDisplayStatus(b) === statusFilter) : items),
    [items, statusFilter]
  );
  return (
    <AdminMyBannersView
      ko={language !== "en"}
      title={t("admin_menu_my_banners")}
      placementNote={t("admin_my_banner_placement_note")}
      loadingLabel={t("common_loading")}
      loading={loading}
      error={error}
      httpStatus={httpStatus}
      onRetry={reload}
      items={visibleItems}
      filtered={statusFilter !== ""}
      onResetFilter={() => setStatusFilter("")}
      filterBar={
        <AdminFilterBar
          ko={ko}
          draft={{ q: "", from: "", to: "" }}
          onDraftChange={() => {}}
          onSubmit={reload}
          onReset={() => setStatusFilter("")}
          pending={loading}
          showPeriod={false}
          showSearch={false}
          className="mb-3"
          status={{
            value: statusFilter,
            onChange: (v) => setStatusFilter(v as "" | AdminBannerDisplayStatus),
            options: (Object.keys(ADMIN_BANNER_DISPLAY_STATUS_KEYS) as AdminBannerDisplayStatus[]).map((v) => ({
              value: v,
              label: t(ADMIN_BANNER_DISPLAY_STATUS_KEYS[v]),
            })),
          }}
        />
      }
      onRemove={reload}
      writeDeniedReason={adminAction.allowed ? null : (adminAction.reason ?? "")}
    />
  );
}

export function AdminMyBannersView({
  ko = true,
  title,
  placementNote,
  loadingLabel,
  loading,
  error,
  httpStatus,
  onRetry,
  items,
  onRemove,
  writeDeniedReason = null,
  filterBar = null,
  filtered = false,
  onResetFilter,
}: {
  title: string;
  /** 회원 화면 노출 위치 안내 (v2.1 §6) */
  placementNote?: string;
  loadingLabel: string;
  loading: boolean;
  error: string | null;
  httpStatus?: number;
  onRetry?: () => void;
  items: AdminBanner[];
  ko?: boolean;
  /**
   * 삭제가 끝난 뒤 호출 (목록 새로고침). 있으면 행에 공용 삭제(`AdminAdDeleteAction` · kind my_banner · 사유만 ·
   * 대상 재입력 없음 · 어드민 SSOT §3-1)를 둔다. 게시 이력 없는 초안 = 완전 삭제 · 그 외 = 숨김 보관은 서버가 정한다.
   */
  onRemove?: (banner: AdminBanner) => void;
  /** null = 쓰기 가능. 문자열 = 추가·수정·삭제 비활성 (사유, 로딩 중이면 빈 문자열) */
  writeDeniedReason?: string | null;
  /** 목록 필터 바 (상태) — 헤더 아래 */
  filterBar?: ReactNode;
  /** 필터가 걸린 빈 목록 → 「조건에 맞는 항목이 없습니다」 + [초기화] */
  filtered?: boolean;
  onResetFilter?: () => void;
}) {
  const writeDenied = writeDeniedReason != null;
  const TH = "px-3 py-2.5 text-left text-xs font-medium text-sam-muted";
  const TD = "px-3 py-2.5 align-top sam-text-body text-sam-fg";
  const period = (b: AdminBanner) =>
    b.startAt || b.endAt
      ? `${b.startAt ? formatAdminManilaDateTime(b.startAt) : "—"} – ${b.endAt ? formatAdminManilaDateTime(b.endAt) : "—"}`
      : translateBy(ko ? "ko" : "en", "admin_my_no_period_limit");
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader title={title} description={placementNote} />
        {writeDenied ? (
          <AdminActionButton variant="primary" disabled title={writeDeniedReason || undefined}>
            {translateBy(ko ? "ko" : "en", "admin_my_add")}
          </AdminActionButton>
        ) : (
          <AdminActionLink href="/admin/my/banners/create" variant="primary">
            {translateBy(ko ? "ko" : "en", "admin_my_add")}
          </AdminActionLink>
        )}
      </div>
      {writeDeniedReason ? (
        <p className="mb-2 text-[12px] text-sam-muted" data-admin-action-denied="1">
          {writeDeniedReason}
        </p>
      ) : null}
      {filterBar}
      {loading ? (
        <AdminLoadingState ko={ko} label={loadingLabel} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error} httpStatus={httpStatus} onRetry={onRetry} />
      ) : items.length === 0 ? (
        filtered ? (
          <AdminEmptyState ko={ko} onReset={onResetFilter} />
        ) : (
          <AdminEmptyState
            ko={ko}
            message={translateBy(ko ? "ko" : "en", "admin_my_no_banners_yet")}
            action={
              writeDenied ? (
                <AdminActionButton
                  variant="primary"
                  size="sm"
                  disabled
                  title={writeDeniedReason || undefined}
                  data-admin-my-banners-empty-create="1"
                >
                  {translateBy(ko ? "ko" : "en", "admin_my_create")}
                </AdminActionButton>
              ) : (
                <AdminActionLink
                  href="/admin/my/banners/create"
                  variant="primary"
                  size="sm"
                  data-admin-my-banners-empty-create="1"
                >
                  {translateBy(ko ? "ko" : "en", "admin_my_create")}
                </AdminActionLink>
              )
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[720px] border-collapse sam-text-body" data-admin-my-banners-table="1">
            <thead className="border-b border-sam-border bg-sam-app">
              <tr>
                <th className={TH}>{translateBy(ko ? "ko" : "en", "admin_my_title")}</th>
                <th className={TH}>{translateBy(ko ? "ko" : "en", "admin_my_status")}</th>
                <th className={TH}>{translateBy(ko ? "ko" : "en", "admin_my_order")}</th>
                <th className={TH}>{translateBy(ko ? "ko" : "en", "admin_my_period_pht")}</th>
                <th className={TH}>{translateBy(ko ? "ko" : "en", "admin_my_manage")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-sam-border last:border-b-0">
                  <td className={`${TD} font-medium`}>{b.title}</td>
                  <td className={TD}>
                    <AdminBannerStatusBadge status={adminBannerDisplayStatus(b)} />
                  </td>
                  <td className={TD}>{b.priority}</td>
                  <td className={`${TD} whitespace-nowrap text-sam-muted`}>{period(b)}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1.5">
                      <AdminActionLink href={`/admin/my/banners/${b.id}/edit`} variant="secondary" size="sm">
                        {translateBy(ko ? "ko" : "en", "common_edit")}
                      </AdminActionLink>
                      {onRemove ? (
                        writeDenied ? (
                          <AdminActionButton variant="danger" size="sm" disabled title={writeDeniedReason || undefined}>
                            {translateBy(ko ? "ko" : "en", "common_delete")}
                          </AdminActionButton>
                        ) : (
                          <AdminAdDeleteAction
                            kind="my_banner"
                            id={b.id}
                            title={b.title}
                            size="sm"
                            onDone={() => onRemove(b)}
                          />
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
