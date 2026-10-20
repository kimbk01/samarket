"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useEffect, useState } from "react";
import type { MyServiceRow } from "@/lib/my/types";

/**
 * V3-11 — 브라우저 직접 조회 대신 관리자 조회 API(`GET /api/admin/my/services`) 사용.
 * 편집 API·편집 화면이 없어 404 이던 수정/추가 링크는 제거하고 안내 문구만 표시한다.
 */
export function AdminMyServicesPage() {
  const { t, language } = useI18n();
  const [items, setItems] = useState<MyServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  /** 조회 실패 = 오류 상태 + [새로고침] (R7 화면 상태). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/my/services", { cache: "no-store", credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          services?: MyServiceRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || json.ok === false) {
          setError(json.error ?? "load_failed");
          setHttpStatus(res.status);
        } else {
          setError(null);
          setHttpStatus(undefined);
          setItems(json.services ?? []);
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

  return (
    <AdminMyServicesView
      ko={language !== "en"}
      title={t("admin_menu_my_services")}
      loadingLabel={t("common_loading")}
      editUnavailableNote={t("admin_my_ia_locked_note")}
      loading={loading}
      error={error}
      httpStatus={httpStatus}
      onRetry={reload}
      items={items}
    />
  );
}

export function AdminMyServicesView({
  ko = true,
  title,
  loadingLabel,
  editUnavailableNote,
  loading,
  error,
  httpStatus,
  onRetry,
  items,
}: {
  title: string;
  loadingLabel: string;
  editUnavailableNote: string;
  loading: boolean;
  error: string | null;
  httpStatus?: number;
  onRetry?: () => void;
  items: MyServiceRow[];
  ko?: boolean;
}) {
  return (
    <div>
      <div className="mb-4">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{title}</h1>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{editUnavailableNote}</p>
      </div>
      {loading ? (
        <AdminLoadingState ko={ko} label={loadingLabel} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error} httpStatus={httpStatus} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <AdminEmptyState ko={ko} message="등록된 서비스가 없습니다." />
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.code} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{s.label}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">
                  {s.is_active ? "노출" : "숨김"} · {s.sort_order}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
