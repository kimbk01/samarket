"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminErrorState } from "@/components/admin/ui/AdminStateViews";
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
          setError(json.error ?? `http_${res.status}`);
          setItems([]);
        } else {
          setError(null);
          setItems(json.services ?? []);
        }
      } catch {
        if (cancelled) return;
        setError("network_error");
        setItems([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminMyServicesView
      ko={language !== "en"}
      title={t("admin_menu_my_services")}
      loadingLabel={t("common_loading")}
      editUnavailableNote={t("admin_my_edit_unavailable_note")}
      loading={loading}
      error={error}
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
  items,
}: {
  title: string;
  loadingLabel: string;
  editUnavailableNote: string;
  loading: boolean;
  error: string | null;
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
        <p className="text-sam-muted">{loadingLabel}</p>
      ) : error ? (
        <AdminErrorState ko={ko} code={error} />
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          등록된 서비스가 없습니다.
        </p>
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
