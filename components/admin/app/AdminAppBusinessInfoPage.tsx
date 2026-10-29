"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import type { AppPlatformBusinessInfoRow } from "@/lib/business/app-platform-business-info";

export function AdminAppBusinessInfoPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  /** G-18: 사업자 정보 추가·수정 = settings 키 (접근표 action — API 403 과 같은 판정) */
  const action = useAdminRouteAction("/admin/app/business");
  const [items, setItems] = useState<AppPlatformBusinessInfoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadErr, setLoadErr] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /** 조회 실패를 빈 목록으로 숨기지 않는다 — 오류 상태 + [새로고침], 직전 목록 유지 (R7). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/app-business-info", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          documents?: AppPlatformBusinessInfoRow[];
          table_missing?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (json.table_missing) setTableMissing(true);
        if (res.ok && json.ok && Array.isArray(json.documents)) setItems(json.documents);
        else if (!json.table_missing) setLoadErr({ code: json.error || "load_failed", httpStatus: res.status });
      } catch {
        if (!cancelled) setLoadErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setLoadErr(null);
    setReloadKey((k) => k + 1);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {t("admin_menu_business")}
        </h1>
        {action.allowed ? (
          <Link
            href="/admin/app/business/create"
            className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
          >
            {t("admin_app_add")}
          </Link>
        ) : (
          <AdminActionButton variant="primary" disabled title={action.reason ?? undefined}>
            {t("admin_app_add")}
          </AdminActionButton>
        )}
      </div>
      {!action.allowed && action.reason ? (
        <p className="mb-4 sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {action.reason}
        </p>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />
      ) : loadErr ? (
        <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={reload} />
      ) : tableMissing ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {safeT("admin_app_business_table_missing", {
            fallbackKo: "app_platform_business_info 테이블이 없습니다. 마이그레이션을 적용해 주세요.",
            fallbackEn: "app_platform_business_info table is missing. Apply the migration.",
          })}
        </p>
      ) : items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_app_business_empty", {
            fallbackKo: "등록된 사업자 정보가 없습니다.",
            fallbackEn: "No business information yet.",
          })}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3"
            >
              <div>
                <span className="font-medium">{d.companyName || "—"}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">
                  {d.locale} · {d.version} · {d.status}
                </span>
              </div>
              <Link href={`/admin/app/business/${d.id}/edit`} className="sam-text-body text-signature">
                {t("common_edit")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
