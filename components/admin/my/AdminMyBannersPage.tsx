"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { ADMIN_BANNER_STATUS_KEYS } from "@/components/admin/banners/admin-banner-i18n";
import type { BannerStatus } from "@/lib/types/admin-banner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminBannerStatusBadge } from "@/components/admin/banners/AdminBannerStatusBadge";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { isAdminBannerHardDeletable } from "@/lib/admin-banners/admin-banner-remove-policy";
import type { AdminBanner } from "@/lib/types/admin-banner";

/** V3-11 — 브라우저 직접 조회 대신 기존 관리자 API(`GET /api/admin/banners`, my_page_banners) 사용. */
export function AdminMyBannersPage() {
  const { t, language } = useI18n();
  /** G-18: 마이페이지 배너 등록·수정·삭제 = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/my/banners");
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

  const [removingId, setRemovingId] = useState<string | null>(null);
  const ko = language !== "en";
  /** 상태 필터 — API(GET /api/admin/banners)는 조건 없이 전체를 주므로 화면에서 거른다. */
  const [statusFilter, setStatusFilter] = useState<"" | BannerStatus>("");
  const visibleItems = useMemo(
    () => (statusFilter ? items.filter((b) => b.status === statusFilter) : items),
    [items, statusFilter]
  );
  /** 삭제 (감사 AD-01 · Owner J-4): 노출 전 초안만 실제 삭제, 그 외는 숨김 보관 — 서버가 판정한다. */
  const remove = async (b: AdminBanner) => {
    const hard = isAdminBannerHardDeletable(b);
    const c = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      destructive: true,
      retypeValue: b.title,
      title: ko ? `「${b.title}」 배너 삭제` : `Delete banner "${b.title}"`,
      description: hard
        ? ko
          ? "노출된 적 없는 초안이라 완전히 삭제합니다."
          : "This draft was never shown, so it is deleted permanently."
        : ko
          ? "게시 이력이 있어 지우지 않고 숨김으로 보관합니다. 고객 화면에서는 바로 사라집니다."
          : "It has been shown before, so it is archived as hidden instead of deleted.",
      confirmLabel: ko ? "삭제" : "Delete",
    });
    if (!c.ok) return;
    setRemovingId(b.id);
    try {
      const res = await fetch(`/api/admin/banners/${encodeURIComponent(b.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: c.reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setError(json.error ?? "delete_failed");
        setHttpStatus(res.status);
      } else {
        reload();
      }
    } finally {
      setRemovingId(null);
    }
  };

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
            onChange: (v) => setStatusFilter(v as "" | BannerStatus),
            options: (Object.keys(ADMIN_BANNER_STATUS_KEYS) as BannerStatus[]).map((v) => ({
              value: v,
              label: t(ADMIN_BANNER_STATUS_KEYS[v]),
            })),
          }}
        />
      }
      onRemove={remove}
      removingId={removingId}
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
  removingId = null,
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
  onRemove?: (banner: AdminBanner) => void;
  removingId?: string | null;
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
      : ko
        ? "기간 제한 없음"
        : "No period limit";
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader title={title} description={placementNote} />
        {writeDenied ? (
          <AdminActionButton variant="primary" disabled title={writeDeniedReason || undefined}>
            {ko ? "추가" : "Add"}
          </AdminActionButton>
        ) : (
          <AdminActionLink href="/admin/my/banners/create" variant="primary">
            {ko ? "추가" : "Add"}
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
          <AdminEmptyState ko={ko} message={ko ? "등록된 배너가 없습니다." : "No banners yet."} />
        )
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[720px] border-collapse sam-text-body" data-admin-my-banners-table="1">
            <thead className="border-b border-sam-border bg-sam-app">
              <tr>
                <th className={TH}>{ko ? "제목" : "Title"}</th>
                <th className={TH}>{ko ? "상태" : "Status"}</th>
                <th className={TH}>{ko ? "순서" : "Order"}</th>
                <th className={TH}>{ko ? "기간 (PHT)" : "Period (PHT)"}</th>
                <th className={TH}>{ko ? "관리" : "Manage"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-sam-border last:border-b-0">
                  <td className={`${TD} font-medium`}>{b.title}</td>
                  <td className={TD}>
                    <AdminBannerStatusBadge status={b.status} />
                  </td>
                  <td className={TD}>{b.priority}</td>
                  <td className={`${TD} whitespace-nowrap text-sam-muted`}>{period(b)}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1.5">
                      <AdminActionLink href={`/admin/my/banners/${b.id}/edit`} variant="secondary" size="sm">
                        {ko ? "수정" : "Edit"}
                      </AdminActionLink>
                      {onRemove ? (
                        <AdminActionButton
                          variant="danger"
                          size="sm"
                          disabled={removingId === b.id || writeDenied}
                          title={writeDeniedReason || undefined}
                          onClick={() => onRemove(b)}
                        >
                          {ko ? "삭제" : "Delete"}
                        </AdminActionButton>
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
