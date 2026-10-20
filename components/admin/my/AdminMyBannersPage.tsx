"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminBanner } from "@/lib/types/admin-banner";

/** V3-11 — 브라우저 직접 조회 대신 기존 관리자 API(`GET /api/admin/banners`, my_page_banners) 사용. */
export function AdminMyBannersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(json.error ?? `http_${res.status}`);
          setItems([]);
        } else {
          setError(null);
          setItems(json.banners ?? []);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setItems([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminMyBannersView title={t("admin_my_k4ab546c0")} loadingLabel={t("common_loading")} loading={loading} error={error} items={items} />
  );
}

export function AdminMyBannersView({
  title,
  loadingLabel,
  loading,
  error,
  items,
}: {
  title: string;
  loadingLabel: string;
  loading: boolean;
  error: string | null;
  items: AdminBanner[];
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
      {loading ? (
        <p className="text-sam-muted">{loadingLabel}</p>
      ) : error ? (
        <p className="rounded-ui-rect bg-red-50 p-4 sam-text-body text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          등록된 배너가 없습니다.
        </p>
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
