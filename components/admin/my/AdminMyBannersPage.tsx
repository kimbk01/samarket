"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminBanner } from "@/lib/types/admin-banner";

/** V3-11 — 브라우저 직접 조회 대신 기존 관리자 API(`GET /api/admin/banners`, my_page_banners) 사용. */
export function AdminMyBannersPage() {
  const { t, language } = useI18n();
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
      items={items}
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
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{title}</h1>
        <Link
          href="/admin/my/banners/create"
          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          추가
        </Link>
      </div>
      {placementNote ? <p className="-mt-2 mb-4 sam-text-body-secondary text-sam-muted">{placementNote}</p> : null}
      {loading ? (
        <AdminLoadingState ko={ko} label={loadingLabel} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error} httpStatus={httpStatus} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <AdminEmptyState ko={ko} message="등록된 배너가 없습니다." />
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{b.title}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">
                  {b.status === "active" ? "노출" : "숨김"} · 순서 {b.priority}
                </span>
              </div>
              <Link href={`/admin/my/banners/${b.id}/edit`} className="sam-text-body text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
